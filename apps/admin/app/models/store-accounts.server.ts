import { Prisma } from "@prisma/client";
import db from "../db.server";
import {
  checkBundle,
  registerBundleId,
  testApple,
  testGoogle,
} from "./store-apis.server";
import {
  APP_ID,
  APP_ID_MAX,
  APPLE_KEY_ID,
  APPLE_TEAM_ID,
  APPLE_TEAM_TYPES,
  ASC_APP_ID,
  ISSUER_ID,
  storeAccountsSchema,
  suggestAppId,
  type AppleTeamType,
  type StoreAccounts,
  type StoreIssue,
} from "./store-accounts";
import {
  getStoreKeys,
  keepStoreKeys,
  putStoreKeys,
  type GoogleServiceAccount,
  type StoreKeys,
} from "./vault.server";

// The merchant's App ID and the keys from their own Apple and Google developer accounts
// (Publishing page, components/store-accounts.tsx). Keys are tested before they're kept
// (models/store-apis.server.ts), stored only in the vault (models/vault.server.ts), and
// never shown again. Appsy never submits apps for review: the merchant does that in their
// own consoles (Apple 4.2.6).

// Key files are small; anything bigger isn't one.
const MAX_KEY_TEXT = 20_000;

type Result = { issues: StoreIssue[]; notice?: string };

async function loadProject(appProjectId: string) {
  const project = await db.appProject.findUniqueOrThrow({
    where: { id: appProjectId },
    select: {
      appName: true,
      iosBundleId: true,
      androidPackage: true,
      storeAccounts: true,
    },
  });
  const parsed = storeAccountsSchema.safeParse(project.storeAccounts ?? {});
  return { ...project, accounts: parsed.success ? parsed.data : {} };
}

export async function loadStoreAccounts(
  appProjectId: string,
  shopDomain: string,
) {
  const project = await loadProject(appProjectId);
  return {
    appId: project.iosBundleId,
    suggestedAppId: suggestAppId(shopDomain),
    accounts: project.accounts,
  };
}

const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";
const issue = (field: StoreIssue["field"], message: string): Result => ({
  issues: [{ field, message }],
});
const APPLE_ID_HELP =
  "An app's Apple ID is a number, shown in App Store Connect under App Information.";

// App ID: both the bundle ID and the package name. Google Play's key test belongs to one
// package name, so it can't change while Google Play is connected.
export async function saveAppId(
  appProjectId: string,
  value: FormDataEntryValue | null,
) {
  const appId = text(value).toLowerCase();
  if (!APP_ID.test(appId) || appId.length > APP_ID_MAX) {
    return issue(
      "appId",
      "Use lowercase letters, numbers and dots, in two or more parts that each start with a letter, like com.yourbrand.app.",
    );
  }
  const project = await loadProject(appProjectId);
  if (project.iosBundleId === appId)
    return { issues: [], notice: "App ID saved" };
  if (project.accounts.google) {
    return issue(
      "appId",
      "Disconnect Google Play first: its key was tested for your current App ID.",
    );
  }
  const accounts: StoreAccounts = { ...project.accounts };
  if (accounts.apple) {
    const keys = await getStoreKeys(appProjectId);
    const bundleRegistered = keys?.apple
      ? await checkBundle(keys.apple, appId)
      : false;
    accounts.apple = { ...accounts.apple, ascAppId: null, bundleRegistered };
  }
  try {
    await db.appProject.update({
      where: { id: appProjectId },
      data: {
        iosBundleId: appId,
        androidPackage: appId,
        storeAccounts: accounts,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return issue(
        "appId",
        "Another Appsy app already uses this App ID. Choose a different one.",
      );
    }
    throw error;
  }
  return { issues: [], notice: "App ID saved" };
}

// Apple: the App Store Connect API key (Issuer ID, Key ID, .p8 file), with the Team ID and
// account type Expo needs to sign the app. Replacing the key without a new file keeps the
// stored one.
export async function connectApple(
  appProjectId: string,
  form: FormData,
): Promise<Result> {
  const issuerId = text(form.get("issuerId")).toLowerCase();
  const keyId = text(form.get("keyId")).toUpperCase();
  const teamId = text(form.get("teamId")).toUpperCase();
  const teamType = text(form.get("teamType")) as AppleTeamType;
  const ascAppId = text(form.get("ascAppId"));
  const newKey = text(form.get("privateKey"));

  const issues: StoreIssue[] = [];
  if (!ISSUER_ID.test(issuerId)) {
    issues.push({
      field: "issuerId",
      message:
        "Copy the Issuer ID from App Store Connect: it looks like 57246542-96fe-1a63-e053-0824d011072a.",
    });
  }
  if (!APPLE_KEY_ID.test(keyId)) {
    issues.push({
      field: "keyId",
      message: "A Key ID is 10 letters and numbers, like 2X9R4HXF34.",
    });
  }
  if (!APPLE_TEAM_ID.test(teamId)) {
    issues.push({
      field: "teamId",
      message:
        "A Team ID is 10 letters and numbers, shown under Membership details in your Apple Developer account.",
    });
  }
  if (!Object.hasOwn(APPLE_TEAM_TYPES, teamType)) {
    issues.push({ field: "teamType", message: "Choose your account type." });
  }
  if (ascAppId && !ASC_APP_ID.test(ascAppId)) {
    issues.push({ field: "ascAppId", message: APPLE_ID_HELP });
  }
  if (newKey.length > MAX_KEY_TEXT) {
    issues.push({
      field: "privateKey",
      message: "This file is too large to be an App Store Connect key (.p8).",
    });
  }
  const stored = await getStoreKeys(appProjectId);
  const privateKey = newKey || stored?.apple?.privateKey || "";
  if (!privateKey) {
    issues.push({
      field: "privateKey",
      message: "Choose the .p8 key file you downloaded from App Store Connect.",
    });
  }
  if (issues.length > 0) return { issues };

  const project = await loadProject(appProjectId);
  const apple = { issuerId, keyId, teamId, teamType, privateKey };
  const test = await testApple(apple, project.iosBundleId, ascAppId || null);
  if (test.issues.length > 0) return { issues: test.issues };

  const credentialsRef = await putStoreKeys(appProjectId, { ...stored, apple });
  await db.appProject.update({
    where: { id: appProjectId },
    data: {
      credentialsRef,
      storeAccounts: {
        ...project.accounts,
        apple: {
          issuerId,
          keyId,
          teamId,
          teamType,
          ascAppId: ascAppId || null,
          bundleRegistered: test.bundleRegistered,
          testedAt: new Date().toISOString(),
        },
      },
    },
  });
  return { issues: [], notice: "App Store connected" };
}

// The app record's Apple ID, added once the merchant has created the app in App Store
// Connect; checked against the App ID with the stored key.
export async function saveAscAppId(
  appProjectId: string,
  value: FormDataEntryValue | null,
) {
  const ascAppId = text(value);
  if (ascAppId && !ASC_APP_ID.test(ascAppId))
    return issue("ascAppId", APPLE_ID_HELP);
  const project = await loadProject(appProjectId);
  const keys = await getStoreKeys(appProjectId);
  if (!project.accounts.apple || !keys?.apple) {
    return issue(null, "Connect your App Store account first.");
  }
  const test = await testApple(
    keys.apple,
    project.iosBundleId,
    ascAppId || null,
  );
  if (test.issues.length > 0) return { issues: test.issues };
  await db.appProject.update({
    where: { id: appProjectId },
    data: {
      storeAccounts: {
        ...project.accounts,
        apple: {
          ...project.accounts.apple,
          ascAppId: ascAppId || null,
          bundleRegistered: test.bundleRegistered,
          testedAt: new Date().toISOString(),
        },
      },
    },
  });
  return { issues: [], notice: "Saved" };
}

// Registers the App ID as a bundle ID in the merchant's Apple account, so they can pick it
// when they create the app in App Store Connect.
export async function registerBundle(appProjectId: string): Promise<Result> {
  const project = await loadProject(appProjectId);
  const keys = await getStoreKeys(appProjectId);
  const appId = project.iosBundleId;
  if (!appId) return issue("appId", "Save your App ID first.");
  if (!project.accounts.apple || !keys?.apple) {
    return issue(null, "Connect your App Store account first.");
  }
  const problem = await registerBundleId(keys.apple, appId, project.appName);
  if (problem) return { issues: [problem] };
  await db.appProject.update({
    where: { id: appProjectId },
    data: {
      storeAccounts: {
        ...project.accounts,
        apple: { ...project.accounts.apple, bundleRegistered: true },
      },
    },
  });
  return { issues: [], notice: "App ID registered with Apple" };
}

// Google Play: a Google Cloud service account's JSON key, with access to the app in Play
// Console.
export async function connectGoogle(
  appProjectId: string,
  form: FormData,
): Promise<Result> {
  const project = await loadProject(appProjectId);
  const packageName = project.androidPackage;
  if (!packageName) return issue("appId", "Save your App ID first.");
  const raw = text(form.get("serviceAccount"));
  if (!raw) {
    return issue(
      "serviceAccount",
      "Choose the JSON key file you downloaded from Google Cloud.",
    );
  }
  if (raw.length > MAX_KEY_TEXT) {
    return issue(
      "serviceAccount",
      "This file is too large to be a service account key.",
    );
  }
  let serviceAccount: GoogleServiceAccount;
  try {
    serviceAccount = JSON.parse(raw) as GoogleServiceAccount;
  } catch {
    return issue(
      "serviceAccount",
      "This isn't a JSON key file. Download the key again from Google Cloud.",
    );
  }
  if (
    serviceAccount?.type !== "service_account" ||
    typeof serviceAccount.client_email !== "string" ||
    typeof serviceAccount.private_key !== "string"
  ) {
    return issue(
      "serviceAccount",
      "This JSON file isn't a service account key. In Google Cloud, create a key of type JSON for the service account.",
    );
  }

  const test = await testGoogle(serviceAccount, packageName);
  if (test.issues.length > 0) return { issues: test.issues };
  const stored = await getStoreKeys(appProjectId);
  const credentialsRef = await putStoreKeys(appProjectId, {
    ...stored,
    google: { serviceAccount },
  });
  await db.appProject.update({
    where: { id: appProjectId },
    data: {
      credentialsRef,
      storeAccounts: {
        ...project.accounts,
        google: {
          clientEmail: serviceAccount.client_email,
          appAccess: test.appAccess,
          testedAt: new Date().toISOString(),
        },
      },
    },
  });
  return {
    issues: [],
    notice: test.appAccess
      ? "Google Play connected"
      : "Key works. Google Play confirms access to your app at its first upload.",
  };
}

export async function disconnect(
  appProjectId: string,
  platform: "apple" | "google",
) {
  const project = await loadProject(appProjectId);
  const keys: StoreKeys = { ...(await getStoreKeys(appProjectId)) };
  delete keys[platform];
  // The push notifications key shares the secret, so it can outlive both store keys.
  const credentialsRef = await keepStoreKeys(appProjectId, keys);
  const accounts: StoreAccounts = { ...project.accounts };
  delete accounts[platform];
  await db.appProject.update({
    where: { id: appProjectId },
    data: { credentialsRef, storeAccounts: accounts },
  });
  return {
    issues: [],
    notice:
      platform === "apple"
        ? "App Store disconnected"
        : "Google Play disconnected",
  };
}
