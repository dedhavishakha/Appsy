import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { StoreIssue } from "./store-accounts";
import type { GoogleServiceAccount } from "./vault.server";

// The calls to Apple's App Store Connect API and Google's Play Developer API that test a
// merchant's keys and register their App ID (models/store-accounts.server.ts). Messages
// are written for the merchant; logs never include keys.

const APPLE_API = "https://api.appstoreconnect.apple.com";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER =
  "https://androidpublisher.googleapis.com/androidpublisher/v3";

export type AppleKey = { issuerId: string; keyId: string; privateKey: string };

// --- Apple ---------------------------------------------------------------------------

// Apple's API token: ES256, signed with the .p8 key, for at most 20 minutes
// (https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests).
export function appleToken(apple: AppleKey) {
  const key = createPrivateKey(apple.privateKey);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("Not an App Store Connect key");
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt(
    { alg: "ES256", kid: apple.keyId, typ: "JWT" },
    {
      iss: apple.issuerId,
      iat: now,
      exp: now + 10 * 60,
      aud: "appstoreconnect-v1",
    },
    key,
    "ieee-p1363",
  );
}

async function appleApi(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${APPLE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
}

// Whether Apple accepts the key and lets it see the team's apps; with the app's Apple ID,
// also that the app exists and its bundle ID is the App ID. Reports whether the App ID is
// registered as a bundle ID.
export async function testApple(
  apple: AppleKey,
  appId: string | null,
  ascAppId: string | null,
): Promise<{ issues: StoreIssue[]; bundleRegistered: boolean }> {
  const fail = (field: StoreIssue["field"], message: string) => ({
    issues: [{ field, message }],
    bundleRegistered: false,
  });
  let token: string;
  try {
    token = appleToken(apple);
  } catch {
    return fail(
      "privateKey",
      "This isn't an App Store Connect API key file (.p8). Download the key from App Store Connect again.",
    );
  }
  const apps = await appleApi(token, "/v1/apps?limit=1");
  if (apps === null) return fail(null, "Apple didn't answer. Try again.");
  if (apps.status === 401) {
    return fail(
      null,
      "Apple didn't accept this key. Check that the Issuer ID, Key ID and .p8 file belong together and that the key hasn't been revoked.",
    );
  }
  if (apps.status === 403) {
    return fail(
      null,
      "Apple accepted the key but didn't let it see your apps. Create a key with the Admin role.",
    );
  }
  if (!apps.ok)
    return fail(null, `Apple didn't answer (error ${apps.status}). Try again.`);

  if (ascAppId) {
    const app = await appleApi(
      token,
      `/v1/apps/${ascAppId}?fields[apps]=bundleId`,
    );
    if (app === null) return fail(null, "Apple didn't answer. Try again.");
    if (app.status === 404) {
      return fail(
        "ascAppId",
        "Your App Store Connect has no app with this Apple ID.",
      );
    }
    if (!app.ok)
      return fail(
        null,
        `Apple didn't answer (error ${app.status}). Try again.`,
      );
    const body = (await app.json()) as {
      data?: { attributes?: { bundleId?: string } };
    };
    const bundleId = body.data?.attributes?.bundleId?.toLowerCase();
    if (appId && bundleId && bundleId !== appId) {
      return fail(
        "ascAppId",
        `That app's bundle ID is ${bundleId}, but your App ID is ${appId}. They must match.`,
      );
    }
  }
  const bundleRegistered = appId
    ? await findBundle(token, appId).catch(() => false)
    : false;
  return { issues: [], bundleRegistered };
}

// Whether the App ID is registered with Apple, using a stored key; false when Apple can't
// say.
export async function checkBundle(apple: AppleKey, appId: string) {
  try {
    return await findBundle(appleToken(apple), appId);
  } catch {
    return false;
  }
}

// Whether the App ID is registered as a bundle ID in the merchant's Apple team.
async function findBundle(token: string, appId: string) {
  const query = new URLSearchParams({
    "filter[identifier]": appId,
    limit: "200",
  });
  const response = await appleApi(token, `/v1/bundleIds?${query}`);
  if (!response?.ok) return false;
  const body = (await response.json()) as {
    data?: { attributes?: { identifier?: string } }[];
  };
  return (body.data ?? []).some(
    (bundle) => bundle.attributes?.identifier?.toLowerCase() === appId,
  );
}

// Registers the App ID as an iOS bundle ID in the merchant's Apple team (Apple: POST
// /v1/bundleIds, with identifier, name and platform). Null when it's registered.
export async function registerBundleId(
  apple: AppleKey,
  appId: string,
  appName: string,
): Promise<StoreIssue | null> {
  const token = appleToken(apple);
  if (await findBundle(token, appId)) return null;
  const response = await appleApi(token, "/v1/bundleIds", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "bundleIds",
        attributes: {
          identifier: appId,
          // Apple's identifier descriptions take letters, numbers and spaces.
          name: appName.replace(/[^A-Za-z0-9 ]/g, "").trim() || "Shopping app",
          platform: "IOS",
        },
      },
    }),
  });
  if (response === null)
    return { field: null, message: "Apple didn't answer. Try again." };
  if (response.ok || (await findBundle(token, appId))) return null;
  console.error(`Registering ${appId} with Apple: ${response.status}`);
  return {
    field: "appId",
    message:
      response.status === 409
        ? "Apple says this App ID is already used, probably by another developer account. Choose a different App ID."
        : `Apple didn't register the App ID (error ${response.status}). Check that your key has the Admin role, then try again.`,
  };
}

// --- Google --------------------------------------------------------------------------

const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

// A Google access token for the service account and one API's scope: an RS256 JWT exchanged
// at Google's token address
// (https://developers.google.com/identity/protocols/oauth2/service-account). Throws when the
// key file's private key can't be read. Push notifications use it too (push.server.ts).
export async function googleToken(
  serviceAccount: GoogleServiceAccount,
  scope = ANDROID_PUBLISHER_SCOPE,
) {
  const key = createPrivateKey(serviceAccount.private_key);
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    {
      alg: "RS256",
      typ: "JWT",
      ...(serviceAccount.private_key_id
        ? { kid: serviceAccount.private_key_id }
        : {}),
    },
    {
      iss: serviceAccount.client_email,
      scope,
      aud: GOOGLE_TOKEN,
      iat: now,
      exp: now + 10 * 60,
    },
    key,
  );
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) return { error: "Google didn't answer. Try again." };
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!response.ok || !body.access_token) {
    console.error(`Google service account token: ${response.status}`);
    return {
      error:
        "Google didn't accept this key. It may have been deleted in Google Cloud: create a new JSON key and try again.",
    };
  }
  return { token: body.access_token };
}

// Whether Google accepts the key and lets it open an edit of the app (discarded at once).
// Before the app's first upload Google Play doesn't know its package name, so a 404 still
// counts as a working key, without app access.
export async function testGoogle(
  serviceAccount: GoogleServiceAccount,
  packageName: string,
): Promise<{ issues: StoreIssue[]; appAccess: boolean }> {
  const fail = (message: string) => ({
    issues: [{ field: "serviceAccount" as const, message }],
    appAccess: false,
  });
  let token: string;
  try {
    const result = await googleToken(serviceAccount);
    if (!result.token)
      return fail(result.error ?? "Google didn't accept this key.");
    token = result.token;
  } catch {
    return fail(
      "This key file's private key can't be read. Download a new JSON key from Google Cloud.",
    );
  }
  const edits = `${ANDROID_PUBLISHER}/applications/${encodeURIComponent(packageName)}/edits`;
  const response = await fetch(edits, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) return fail("Google Play didn't answer. Try again.");
  if (response.ok) {
    const { id } = (await response.json().catch(() => ({}))) as { id?: string };
    if (id) {
      await fetch(`${edits}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
    }
    return { issues: [], appAccess: true };
  }
  const detail = await response.text().catch(() => "");
  console.error(`Google Play edit test for ${packageName}: ${response.status}`);
  if (response.status === 404) return { issues: [], appAccess: false };
  if (
    response.status === 403 &&
    /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(
      detail,
    )
  ) {
    return fail(
      "Turn on the Google Play Android Developer API in this key's Google Cloud project (Google Play step 2 below), then try again.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    return fail(
      `This service account can't manage ${packageName}. In Play Console, open Users and permissions and give it access to your app (Google Play step 2 below).`,
    );
  }
  return fail(
    `Google Play didn't answer (error ${response.status}). Try again.`,
  );
}

// --- Both ----------------------------------------------------------------------------

function jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: KeyObject,
  dsaEncoding?: "ieee-p1363",
) {
  const encode = (part: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(part)).toString("base64url");
  const data = `${encode(header)}.${encode(payload)}`;
  const signature = sign(
    "sha256",
    Buffer.from(data),
    dsaEncoding ? { key, dsaEncoding } : key,
  );
  return `${data}.${signature.toString("base64url")}`;
}
