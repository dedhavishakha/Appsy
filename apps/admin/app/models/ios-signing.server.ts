import { generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";
import db from "../db.server";
import {
  appleApi,
  appleToken,
  bundleResourceId,
  registerBundleId,
} from "./store-apis.server";
import { getStoreKeys, putStoreKeys, type IosSigning } from "./vault.server";

// The signing files Expo's builds need for a merchant's iPhone app ("local credentials",
// https://docs.expo.dev/app-signing/local-credentials/): a distribution certificate, as a
// .p12 with its private key, and an App Store provisioning profile for the App ID. Expo's
// CLI won't create a certificate without someone at the keyboard (eas-cli 25.3.0), so Appsy
// makes them with the merchant's App Store Connect key through Apple's API (create a
// certificate, enable a capability, create a profile) and keeps them in the vault. Every
// build has expo-notifications, whose entitlement needs Push Notifications on the App ID and
// in the profile. Never tried against a real Apple account yet: the first iPhone build is
// the real test.

// Made again this long before Apple's expiry date.
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60_000;

// A problem the merchant can fix, shown to them as it is.
export class SigningProblem extends Error {}

export type IosSigningFiles = {
  p12: string;
  password: string;
  profile: string;
};

type AppleError = {
  errors?: { status?: string; code?: string; detail?: string }[];
};
type AppleResource<T> = AppleError & { data?: { id?: string; attributes?: T } };

const KEY_ROLE =
  "Your App Store Connect key can't manage signing. Connect a key with the Admin role under Store accounts.";

async function apple<T>(token: string, path: string, init?: RequestInit) {
  const response = await appleApi(token, path, init);
  if (response === null) {
    throw new SigningProblem("Apple didn't answer. Please try again.");
  }
  const body = (await response.json().catch(() => ({}))) as T & AppleError;
  if (response.status === 401 || response.status === 403) {
    console.error(`Apple ${path}: ${response.status}`, body.errors?.[0]?.code);
    throw new SigningProblem(
      response.status === 401
        ? "Apple didn't accept your App Store Connect key. Connect it again under Store accounts."
        : KEY_ROLE,
    );
  }
  return { response, body };
}

// What Apple said went wrong, for the merchant.
function appleDetail(body: AppleError) {
  return body.errors?.[0]?.detail?.trim() ?? "";
}

// The signing files for one build of the App ID, made or renewed when needed.
export async function iosSigningFor(
  appProjectId: string,
  bundleId: string,
  appName: string,
): Promise<IosSigningFiles> {
  const keys = await getStoreKeys(appProjectId);
  if (!keys?.apple) {
    throw new SigningProblem(
      "Connect your App Store account under Store accounts.",
    );
  }
  let token: string;
  try {
    token = appleToken(keys.apple);
  } catch {
    throw new SigningProblem(
      "Your App Store Connect key can't be read. Connect it again under Store accounts.",
    );
  }

  const bundle = await ensureBundle(token, keys.apple, bundleId, appName);
  const pushAdded = await ensurePushCapability(token, bundle);
  const saved = keys.iosSigning ?? null;
  const certificate =
    saved && (await certificateStillValid(token, saved.certificate))
      ? saved.certificate
      : await createCertificate(token);
  const old = saved?.profiles[bundleId];
  // A new capability makes Apple's earlier profiles invalid.
  const profile =
    old &&
    !pushAdded &&
    old.certificateId === certificate.id &&
    (await profileStillActive(token, old))
      ? old
      : await createProfile(token, bundle, bundleId, certificate.id, old);

  const next: IosSigning = {
    certificate,
    profiles: {
      ...(saved?.certificate.id === certificate.id ? saved.profiles : {}),
      [bundleId]: profile,
    },
  };
  if (JSON.stringify(next) !== JSON.stringify(saved)) {
    const latest = await getStoreKeys(appProjectId);
    const credentialsRef = await putStoreKeys(appProjectId, {
      ...latest,
      iosSigning: next,
    });
    await db.appProject.update({
      where: { id: appProjectId },
      data: { credentialsRef },
    });
  }
  return {
    p12: certificate.p12,
    password: certificate.password,
    profile: profile.content,
  };
}

// The App ID's bundle ID record in the merchant's Apple team, registered when missing.
async function ensureBundle(
  token: string,
  key: Parameters<typeof registerBundleId>[0],
  bundleId: string,
  appName: string,
) {
  const found = await bundleResourceId(token, bundleId);
  if (found) return found;
  const problem = await registerBundleId(key, bundleId, appName);
  if (problem) throw new SigningProblem(problem.message);
  const registered = await bundleResourceId(token, bundleId);
  if (!registered) {
    throw new SigningProblem(
      "Apple didn't register your App ID. Please try again.",
    );
  }
  return registered;
}

// Push Notifications on the App ID (Apple: POST /v1/bundleIdCapabilities). True when it
// was just added.
async function ensurePushCapability(token: string, bundle: string) {
  const { response, body } = await apple<{
    data?: { attributes?: { capabilityType?: string } }[];
  }>(token, `/v1/bundleIds/${bundle}/bundleIdCapabilities?limit=200`);
  if (!response.ok) {
    throw new SigningProblem(
      `Apple didn't list your App ID's capabilities (error ${response.status}). Please try again.`,
    );
  }
  if (
    (body.data ?? []).some(
      (capability) =>
        capability.attributes?.capabilityType === "PUSH_NOTIFICATIONS",
    )
  ) {
    return false;
  }
  const added = await apple<AppleResource<unknown>>(
    token,
    "/v1/bundleIdCapabilities",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "bundleIdCapabilities",
          attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle } },
          },
        },
      }),
    },
  );
  if (!added.response.ok) {
    console.error(
      `Apple push capability: ${added.response.status}`,
      added.body.errors?.[0]?.code,
    );
    throw new SigningProblem(
      `Apple didn't turn on push notifications for your App ID. ${appleDetail(added.body)}`.trim(),
    );
  }
  return true;
}

const usable = (expiresAt: string) =>
  new Date(expiresAt).getTime() - Date.now() > RENEW_BEFORE_MS;

// Not close to expiring, and not revoked in the merchant's Apple account.
async function certificateStillValid(
  token: string,
  certificate: IosSigning["certificate"],
) {
  if (!usable(certificate.expiresAt)) return false;
  const { response } = await apple<unknown>(
    token,
    `/v1/certificates/${encodeURIComponent(certificate.id)}`,
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new SigningProblem(
      `Apple didn't answer about your signing certificate (error ${response.status}). Please try again.`,
    );
  }
  return true;
}

async function profileStillActive(
  token: string,
  profile: IosSigning["profiles"][string],
) {
  if (!usable(profile.expiresAt)) return false;
  const { response, body } = await apple<
    AppleResource<{ profileState?: string }>
  >(token, `/v1/profiles/${encodeURIComponent(profile.id)}`);
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new SigningProblem(
      `Apple didn't answer about your provisioning profile (error ${response.status}). Please try again.`,
    );
  }
  return body.data?.attributes?.profileState === "ACTIVE";
}

// A new iOS distribution certificate (the type Expo's own CLI creates), from a certificate
// signing request Appsy makes, kept as a .p12 with a random password.
async function createCertificate(
  token: string,
): Promise<IosSigning["certificate"]> {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const privateKey = forge.pki.privateKeyFromPem(pair.privateKey);
  const request = forge.pki.createCertificationRequest();
  request.publicKey = forge.pki.publicKeyFromPem(pair.publicKey);
  request.setSubject([{ name: "commonName", value: "Appsy" }]);
  request.sign(privateKey, forge.md.sha256.create());

  const { response, body } = await apple<
    AppleResource<{
      certificateContent?: string;
      serialNumber?: string;
      expirationDate?: string;
    }>
  >(token, "/v1/certificates", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "certificates",
        attributes: {
          certificateType: "IOS_DISTRIBUTION",
          csrContent: forge.pki.certificationRequestToPem(request),
        },
      },
    }),
  });
  const content = body.data?.attributes?.certificateContent;
  if (!response.ok || !body.data?.id || !content) {
    console.error(
      `Apple certificate: ${response.status}`,
      body.errors?.[0]?.code,
    );
    const detail = appleDetail(body);
    throw new SigningProblem(
      detail
        ? `Apple didn't make a signing certificate: ${detail} If your account has too many distribution certificates, revoke one you no longer use in your Apple Developer account, then build again.`
        : `Apple didn't make a signing certificate (error ${response.status}). Please try again.`,
    );
  }
  const certificate = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(forge.util.decode64(content)),
  );
  const password = randomBytes(18).toString("base64url");
  const p12 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, {
    friendlyName: "Appsy distribution",
    algorithm: "3des",
  });
  return {
    id: body.data.id,
    serialNumber:
      body.data.attributes?.serialNumber ?? certificate.serialNumber,
    expiresAt:
      body.data.attributes?.expirationDate ??
      certificate.validity.notAfter.toISOString(),
    p12: forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    password,
  };
}

// A new App Store profile for the App ID and certificate. The one Appsy made before for
// this App ID goes, so the merchant's account doesn't fill up with old ones.
async function createProfile(
  token: string,
  bundle: string,
  bundleId: string,
  certificateId: string,
  old: IosSigning["profiles"][string] | undefined,
): Promise<IosSigning["profiles"][string]> {
  if (old) {
    await appleApi(token, `/v1/profiles/${encodeURIComponent(old.id)}`, {
      method: "DELETE",
    });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const { response, body } = await apple<
    AppleResource<{ profileContent?: string; expirationDate?: string }>
  >(token, "/v1/profiles", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "profiles",
        attributes: {
          name: `Appsy ${bundleId} ${stamp}`,
          profileType: "IOS_APP_STORE",
        },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundle } },
          certificates: { data: [{ type: "certificates", id: certificateId }] },
        },
      },
    }),
  });
  const content = body.data?.attributes?.profileContent;
  if (!response.ok || !body.data?.id || !content) {
    console.error(`Apple profile: ${response.status}`, body.errors?.[0]?.code);
    throw new SigningProblem(
      `Apple didn't make a provisioning profile. ${appleDetail(body) || `(error ${response.status})`} Please try again.`,
    );
  }
  return {
    id: body.data.id,
    content,
    expiresAt:
      body.data.attributes?.expirationDate ??
      new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
    certificateId,
  };
}
