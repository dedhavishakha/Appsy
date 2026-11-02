import type { AppBuild } from "@prisma/client";
import db from "../db.server";
import {
  ACTIVE_STATUSES,
  type BuildReadiness,
  type BuildRow,
  type BuildStatus,
} from "./builds";
import { liveKey, loadStatus } from "./design.server";
import { firebaseFileFor, firebaseIosFileFor } from "./google-analytics.server";
import { identitySchema } from "./identity";
import { identityKey } from "./identity.server";
import {
  startBuild as startEasBuild,
  submitToAppStoreConnect,
  submitToGooglePlay,
  viewBuild,
  type MerchantApp,
  type Platform,
} from "./eas.server";
import {
  iosSigningFor,
  SigningProblem,
  type IosSigningFiles,
} from "./ios-signing.server";
import { publicUrl, readPublicFile } from "./storage.server";
import { storeAccountsSchema } from "./store-accounts";
import { getStoreKeys } from "./vault.server";

// Builds the merchant's app on Expo (EAS) and uploads it for testing, from the Publishing
// page (components/app-builds.tsx): Android to Google Play's internal testing track, iPhone
// to App Store Connect, where Apple makes it available in TestFlight. iPhone builds are
// signed with files Appsy makes in the merchant's Apple account (ios-signing.server.ts).
// Expo builds with the published design's address built in, and a check every minute moves
// each build along: it uploads finished builds with the merchant's key and records why a
// build or upload failed. Appsy never sends apps for review: merchants do that in Play
// Console and App Store Connect themselves (Apple 4.2.6; decided 2026-10-22).

const CHECK_EVERY_MS = 60_000;
// Starting a build takes minutes at most (eas.server.ts stops the CLI at 15), and an upload
// at most 30 for each of its two tries; rows older than these were cut off by a restart.
const STARTING_LIMIT_MS = 20 * 60_000;
const UPLOADING_LIMIT_MS = 65 * 60_000;
// How long a build may go without Expo answering about it before Appsy gives up on it.
const UNREACHABLE_LIMIT_MS = 24 * 60 * 60_000;
const SHOWN_BUILDS = 5;
const BUILD_ID = /^[0-9a-f-]{36}$/;

// Builds this server is starting or uploading right now.
const starting = new Set<string>();
const uploading = new Set<string>();

type Result = { issues: { message: string }[]; notice?: string };
const issue = (message: string): Result => ({ issues: [{ message }] });

// Builds run on Appsy's server only: the app keeps the design's address for good, and a
// development tunnel's address stops working when the tunnel closes.
function unavailable() {
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";
  let host = "";
  try {
    host = new URL(appUrl).hostname;
  } catch {
    // Not an address: treated as unavailable below.
  }
  if (!appUrl.startsWith("https://") || host.endsWith(".trycloudflare.com")) {
    return "Apps are built from Appsy's server only, not from a development tunnel.";
  }
  if (process.env.NODE_ENV === "production" && !process.env.EXPO_TOKEN) {
    console.error("Builds need EXPO_TOKEN in the server's secret.");
    return "Building apps isn't available just yet. Please try again later.";
  }
  return null;
}

// Builds download the published files first (apps/mobile/scripts/fetch-build-identity.mjs)
// and stop without them, so they're checked here before Expo is asked to build. Each
// platform also needs its store account; iPhone uploads need the app made in App Store
// Connect first, because Apple's API can't make it.
async function readiness(appProjectId: string) {
  const [project, status, liveFile, identityFile] = await Promise.all([
    db.appProject.findUniqueOrThrow({
      where: { id: appProjectId },
      select: {
        appName: true,
        androidPackage: true,
        iosBundleId: true,
        storeAccounts: true,
        identity: true,
      },
    }),
    loadStatus(appProjectId),
    readPublicFile(liveKey(appProjectId)),
    readPublicFile(identityKey(appProjectId)),
  ]);
  const accounts = storeAccountsSchema.safeParse(project.storeAccounts ?? {});
  const missing: string[] = [];
  if (status.liveVersion === null)
    missing.push("Publish your design in the editor.");
  else if (!liveFile) {
    console.error(`Published files missing for app ${appProjectId}`);
    missing.push(
      "Publish your design again (a change in the editor, or a switch in Settings), so the build can include it.",
    );
  }
  // A merchant's app needs its own icon (else it shows Expo's), so builds wait for one.
  const identity = identitySchema.safeParse(project.identity);
  if (!identity.success || !identity.data.icon)
    missing.push("Choose your app's icon under App name and icon, then save.");
  else if (!identityFile)
    missing.push("Save your app name and icon again on this page.");
  const android = [...missing];
  if (!project.androidPackage)
    android.push("Save your App ID under Store accounts.");
  if (!accounts.success || !accounts.data.google)
    android.push("Connect Google Play under Store accounts.");
  const ios = [...missing];
  const apple = accounts.success ? accounts.data.apple : undefined;
  if (!project.iosBundleId) ios.push("Save your App ID under Store accounts.");
  if (!apple) ios.push("Connect the App Store under Store accounts.");
  else if (!apple.ascAppId) {
    ios.push(
      "Create your app in App Store Connect, then add its Apple ID under Store accounts.",
    );
  }
  const notNow = unavailable();
  return {
    readiness: {
      android: { missing: android, unavailable: notNow },
      ios: { missing: ios, unavailable: notNow },
    } satisfies Record<Platform, BuildReadiness>,
    appIds: { android: project.androidPackage, ios: project.iosBundleId },
    appName: project.appName,
    liveVersion: status.liveVersion,
  };
}

function merchantApp(appProjectId: string, appId: string): MerchantApp {
  return {
    appId,
    settingsUrl: publicUrl(
      process.env.SHOPIFY_APP_URL ?? "",
      liveKey(appProjectId),
    ),
  };
}

function toRow(build: AppBuild): BuildRow {
  return {
    id: build.id,
    platform: build.platform,
    status: build.status as BuildStatus,
    appVersion: build.appVersion,
    buildNumber: build.buildNumber,
    artifactUrl: build.artifactUrl,
    error: build.error,
    createdAt: build.createdAt.toISOString(),
  };
}

export async function loadBuilds(appProjectId: string) {
  keepChecking();
  const [
    {
      readiness: { android, ios },
    },
    builds,
  ] = await Promise.all([
    readiness(appProjectId),
    db.appBuild.findMany({
      where: { appProjectId },
      orderBy: { createdAt: "desc" },
      take: SHOWN_BUILDS,
    }),
  ]);
  return { android, ios, builds: builds.map(toRow) };
}

// Starts a build for one platform. The page gets its answer at once; Expo takes the project
// in the background, and the build shows on the page as it moves along.
export async function startBuild(
  appProjectId: string,
  platform: Platform,
  createdBy: string | null,
): Promise<Result> {
  const ready = await readiness(appProjectId);
  const check = ready.readiness[platform];
  const appId = ready.appIds[platform];
  if (check.unavailable) return issue(check.unavailable);
  if (check.missing.length > 0 || !appId) {
    return issue(check.missing[0] ?? "Save your App ID under Store accounts.");
  }
  const running = await db.appBuild.findFirst({
    where: { appProjectId, platform, status: { in: ACTIVE_STATUSES } },
  });
  if (running) {
    return issue(
      platform === "ios"
        ? "Your iPhone app is already being built."
        : "Your Android app is already being built.",
    );
  }

  const build = await db.appBuild.create({
    data: {
      appProjectId,
      platform,
      status: "starting",
      appId,
      designVersion: ready.liveVersion,
      createdBy,
    },
  });
  keepChecking();
  // The merchant's Firebase file for this platform, when they gave one for this App ID
  // (Google Analytics, Functionality page): the build includes Firebase only then.
  const app: MerchantApp = {
    ...merchantApp(appProjectId, appId),
    ...(platform === "ios"
      ? { googleServicesIos: await firebaseIosFileFor(appProjectId, appId) }
      : { googleServices: await firebaseFileFor(appProjectId, appId) }),
  };
  void begin(build.id, platform, app, appProjectId, ready.appName);
  return { issues: [], notice: "Build started" };
}

async function begin(
  buildId: string,
  platform: Platform,
  app: MerchantApp,
  appProjectId: string,
  appName: string,
) {
  starting.add(buildId);
  try {
    let signing: IosSigningFiles | undefined;
    if (platform === "ios") {
      try {
        signing = await iosSigningFor(appProjectId, app.appId, appName);
      } catch (error) {
        if (!(error instanceof SigningProblem)) throw error;
        await settle(buildId, "failed", error.message);
        return;
      }
    }
    const result = await startEasBuild(platform, app, signing);
    if ("error" in result) {
      console.error(`Build ${buildId} didn't start on Expo:\n${result.error}`);
      await settle(
        buildId,
        "failed",
        "Expo didn't take the build. Please try again later.",
      );
      return;
    }
    await db.appBuild.update({
      where: { id: buildId },
      data: {
        status: "building",
        easBuildId: result.build.id,
        appVersion: result.build.appVersion ?? null,
        buildNumber: result.build.appBuildVersion ?? null,
      },
    });
  } catch (error) {
    console.error(`Build ${buildId} didn't start:`, error);
    await settle(
      buildId,
      "failed",
      "Appsy couldn't start the build. Please try again.",
    );
  } finally {
    starting.delete(buildId);
  }
}

// Uploads a build again after the merchant fixed what stopped its upload.
export async function uploadAgain(
  appProjectId: string,
  buildId: FormDataEntryValue | null,
): Promise<Result> {
  if (typeof buildId !== "string" || !BUILD_ID.test(buildId))
    return issue("Choose a build to upload.");
  const claimed = await db.appBuild.updateMany({
    where: {
      id: buildId,
      appProjectId,
      status: "upload_failed",
      easBuildId: { not: null },
    },
    data: { status: "uploading", error: null, finishedAt: null },
  });
  if (claimed.count !== 1) return issue("This build can't be uploaded again.");
  void upload(buildId);
  return { issues: [], notice: "Uploading your app" };
}

async function upload(buildId: string) {
  uploading.add(buildId);
  try {
    const build = await db.appBuild.findUniqueOrThrow({
      where: { id: buildId },
    });
    const keys = await getStoreKeys(build.appProjectId);
    if (build.platform === "ios") {
      await uploadToApple(build, keys?.apple);
      return;
    }
    if (!build.easBuildId || !keys?.google) {
      await settle(
        buildId,
        "upload_failed",
        "Connect Google Play under Store accounts, then try the upload again.",
      );
      return;
    }
    const result = await submitToGooglePlay(
      build.easBuildId,
      merchantApp(build.appProjectId, build.appId),
      keys.google.serviceAccount,
    );
    if ("error" in result) {
      console.error(`Upload of build ${buildId} failed:\n${result.error}`);
      const problem = uploadProblem(result.error);
      await settle(buildId, problem.status, problem.message);
      return;
    }
    await settle(buildId, result.draft ? "uploaded_draft" : "uploaded", null);
  } catch (error) {
    console.error(`Upload of build ${buildId} failed:`, error);
    await settle(
      buildId,
      "upload_failed",
      "Appsy couldn't upload your app. Please try the upload again.",
    );
  } finally {
    uploading.delete(buildId);
  }
}

// An iPhone build to App Store Connect with the merchant's App Store Connect key, into the
// app whose Apple ID they saved.
async function uploadToApple(
  build: AppBuild,
  apple: NonNullable<Awaited<ReturnType<typeof getStoreKeys>>>["apple"],
) {
  const project = await db.appProject.findUniqueOrThrow({
    where: { id: build.appProjectId },
    select: { storeAccounts: true },
  });
  const accounts = storeAccountsSchema.safeParse(project.storeAccounts ?? {});
  const ascAppId = accounts.success ? accounts.data.apple?.ascAppId : null;
  if (!build.easBuildId || !apple || !ascAppId) {
    await settle(
      build.id,
      "upload_failed",
      "Connect the App Store and add your app's Apple ID under Store accounts, then try the upload again.",
    );
    return;
  }
  const result = await submitToAppStoreConnect(
    build.easBuildId,
    merchantApp(build.appProjectId, build.appId),
    { key: apple, teamId: apple.teamId, ascAppId },
  );
  if ("error" in result) {
    console.error(`Upload of build ${build.id} failed:\n${result.error}`);
    const problem = appleUploadProblem(result.error);
    await settle(build.id, problem.status, problem.message);
    return;
  }
  await settle(build.id, "uploaded", null);
}

// The same for App Store Connect. Apple's wording here isn't confirmed yet (no iPhone upload
// has run): anything unmatched gets the short message, and the output stays in the log.
function appleUploadProblem(output: string): {
  status: BuildStatus;
  message: string;
} {
  if (
    /bundle version must be higher|already been used|redundant binary|cfbundleversion/i.test(
      output,
    )
  ) {
    return {
      status: "upload_refused",
      message:
        "App Store Connect already has this build of your app. Build your app again for a new one.",
    };
  }
  if (
    /no suitable application records|could not find (?:the )?app|app .*not found/i.test(
      output,
    )
  ) {
    return {
      status: "upload_failed",
      message:
        "App Store Connect has no app with your app's Apple ID and App ID. Check both under Store accounts, then try the upload again.",
    };
  }
  if (/agreement/i.test(output)) {
    return {
      status: "upload_failed",
      message:
        "Apple needs you to accept its latest agreement. Sign in to App Store Connect, accept it, then try the upload again.",
    };
  }
  if (/\b401\b|unauthori[sz]ed|authentication credentials/i.test(output)) {
    return {
      status: "upload_failed",
      message:
        "Apple didn't accept your App Store Connect key. Connect it again under Store accounts, then try the upload again.",
    };
  }
  return {
    status: "upload_failed",
    message:
      "App Store Connect didn't take the upload. Please try the upload again.",
  };
}

// What the merchant can do about Google Play's most common answers, in Google's words or
// Expo's (eas-cli prints its own message for errors it knows). Anything else gets a short
// message: the CLI's output, with Appsy's Expo links, stays in the server's log.
function uploadProblem(output: string): {
  status: BuildStatus;
  message: string;
} {
  if (
    /package not found|cannot find the app|haven't submitted this app|first (?:submission|version) .*manually/i.test(
      output,
    )
  ) {
    return {
      status: "upload_failed",
      message:
        "Google Play can't find your app yet. In Play Console, check you created it with your App ID as its package name, then try the upload again. If it still doesn't work, download the app file and upload this first version yourself: Test and release › Testing › Internal testing › Create new release.",
    };
  }
  // Expo: "The Google service account cannot submit this app" (Local noodle, 2026-10-27).
  if (
    /cannot submit this app|does(?:n't| not) have (?:the )?permission/i.test(
      output,
    )
  ) {
    return {
      status: "upload_failed",
      message:
        'Your Google Play key can\'t release this app yet. In Play Console, open Users and permissions, open the service account, and under App permissions add this app with "Release apps to testing tracks". Then try the upload again.',
    };
  }
  if (
    /version code .*already been used|already submitted this version/i.test(
      output,
    )
  ) {
    return {
      status: "upload_refused",
      message:
        "Google Play already has this version of your app, for example because it was uploaded in Play Console. Build your app again for a new version.",
    };
  }
  return {
    status: "upload_failed",
    message: "Google Play didn't take the upload. Please try the upload again.",
  };
}

async function settle(
  buildId: string,
  status: BuildStatus,
  error: string | null,
) {
  await db.appBuild.update({
    where: { id: buildId },
    data: { status, error, finishedAt: new Date() },
  });
}

// The check runs while the server does, from its start (this module loads with the server
// build), so builds that were moving along before a restart carry on without anyone
// opening the page. Each check uses the newest code (the dev server reloads modules).
declare global {
  // eslint-disable-next-line no-var
  var appsyBuildCheck: (() => Promise<void>) | undefined;
  // eslint-disable-next-line no-var
  var appsyBuildTimer: NodeJS.Timeout | undefined;
}

let checking = false;
globalThis.appsyBuildCheck = async () => {
  if (checking) return;
  checking = true;
  try {
    const builds = await db.appBuild.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "asc" },
    });
    for (const build of builds) {
      await checkBuild(build).catch((error) =>
        console.error(`Checking build ${build.id}:`, error),
      );
    }
  } finally {
    checking = false;
  }
};

function keepChecking() {
  if (globalThis.appsyBuildTimer) return;
  globalThis.appsyBuildTimer = setInterval(
    () => void globalThis.appsyBuildCheck?.(),
    CHECK_EVERY_MS,
  );
  globalThis.appsyBuildTimer.unref();
}

keepChecking();

async function checkBuild(build: AppBuild) {
  const age = Date.now() - build.updatedAt.getTime();
  if (build.status === "starting") {
    if (!starting.has(build.id) && age > STARTING_LIMIT_MS) {
      await settle(
        build.id,
        "failed",
        "Appsy restarted while starting this build. Please start it again.",
      );
    }
    return;
  }
  if (build.status === "uploading") {
    if (!uploading.has(build.id) && age > UPLOADING_LIMIT_MS) {
      await settle(
        build.id,
        "upload_failed",
        "The upload didn't finish. Check Internal testing in Play Console, or try the upload again.",
      );
    }
    return;
  }
  if (!build.easBuildId) return;
  const eas = await viewBuild(build.easBuildId);
  if (!eas) {
    if (Date.now() - build.createdAt.getTime() > UNREACHABLE_LIMIT_MS) {
      await settle(
        build.id,
        "failed",
        "Appsy couldn't follow this build on Expo. Please start it again.",
      );
    }
    return;
  }
  if (eas.status === "FINISHED") {
    // Claimed first, so the build is uploaded once even with more than one server.
    const claimed = await db.appBuild.updateMany({
      where: { id: build.id, status: "building" },
      data: {
        status: "uploading",
        artifactUrl: eas.artifacts?.applicationArchiveUrl ?? null,
        appVersion: eas.appVersion ?? build.appVersion,
        buildNumber: eas.appBuildVersion ?? build.buildNumber,
      },
    });
    if (claimed.count === 1) void upload(build.id);
  } else if (eas.status === "ERRORED") {
    console.error(
      `Build ${build.id} (Expo ${build.easBuildId}) failed:`,
      eas.error?.message,
    );
    await settle(
      build.id,
      "failed",
      `Expo couldn't build your app${eas.error?.message ? `: ${eas.error.message}` : "."}`,
    );
  } else if (eas.status === "CANCELED") {
    await settle(build.id, "failed", "The build was canceled.");
  }
}
