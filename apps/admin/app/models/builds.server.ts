import type { AppBuild } from "@prisma/client";
import db from "../db.server";
import {
  ACTIVE_STATUSES,
  type BuildReadiness,
  type BuildRow,
  type BuildStatus,
} from "./builds";
import { liveKey, loadStatus } from "./design.server";
import {
  startAndroidBuild,
  submitToGooglePlay,
  viewBuild,
  type MerchantApp,
} from "./eas.server";
import { publicUrl } from "./storage.server";
import { storeAccountsSchema } from "./store-accounts";
import { getStoreKeys } from "./vault.server";

// Builds the merchant's app on Expo (EAS) and uploads it to Google Play's internal testing
// track, from the Publishing page (components/app-builds.tsx). Android first; the App
// Store follows. Expo builds with the published design's address built in, and a check
// every minute moves each build along: it uploads finished builds with the merchant's key
// and records why a build or upload failed. Appsy never sends apps for review: merchants
// do that in Play Console themselves (Apple 4.2.6; decided 2026-10-22).

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

async function readiness(appProjectId: string) {
  const [project, status] = await Promise.all([
    db.appProject.findUniqueOrThrow({
      where: { id: appProjectId },
      select: { androidPackage: true, storeAccounts: true },
    }),
    loadStatus(appProjectId),
  ]);
  const accounts = storeAccountsSchema.safeParse(project.storeAccounts ?? {});
  const missing: string[] = [];
  if (status.liveVersion === null)
    missing.push("Publish your design in the editor.");
  if (!project.androidPackage)
    missing.push("Save your App ID under Store accounts.");
  if (!accounts.success || !accounts.data.google)
    missing.push("Connect Google Play under Store accounts.");
  return {
    readiness: { missing, unavailable: unavailable() } satisfies BuildReadiness,
    appId: project.androidPackage,
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
  const [{ readiness: android }, builds] = await Promise.all([
    readiness(appProjectId),
    db.appBuild.findMany({
      where: { appProjectId },
      orderBy: { createdAt: "desc" },
      take: SHOWN_BUILDS,
    }),
  ]);
  return { android, builds: builds.map(toRow) };
}

// Starts an Android build. The page gets its answer at once; Expo takes the project in the
// background, and the build shows on the page as it moves along.
export async function startBuild(
  appProjectId: string,
  createdBy: string | null,
): Promise<Result> {
  const {
    readiness: ready,
    appId,
    liveVersion,
  } = await readiness(appProjectId);
  if (ready.unavailable) return issue(ready.unavailable);
  if (ready.missing.length > 0 || !appId) return issue(ready.missing[0]);
  const running = await db.appBuild.findFirst({
    where: {
      appProjectId,
      platform: "android",
      status: { in: ACTIVE_STATUSES },
    },
  });
  if (running) return issue("Your app is already being built.");

  const build = await db.appBuild.create({
    data: {
      appProjectId,
      platform: "android",
      status: "starting",
      appId,
      designVersion: liveVersion,
      createdBy,
    },
  });
  keepChecking();
  void begin(build.id, merchantApp(appProjectId, appId));
  return { issues: [], notice: "Build started" };
}

async function begin(buildId: string, app: MerchantApp) {
  starting.add(buildId);
  try {
    const result = await startAndroidBuild(app);
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
  return { issues: [], notice: "Uploading to Google Play" };
}

async function upload(buildId: string) {
  uploading.add(buildId);
  try {
    const build = await db.appBuild.findUniqueOrThrow({
      where: { id: buildId },
    });
    const keys = await getStoreKeys(build.appProjectId);
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
      await settle(buildId, "upload_failed", uploadProblem(result.error));
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

// What the merchant can do about Google Play's most common answers; otherwise its own words.
function uploadProblem(error: string) {
  if (/package not found/i.test(error)) {
    return "Google Play doesn't know your App ID yet. Download the app file and upload this first version yourself in Play Console: Test and release › Testing › Internal testing › Create new release. Appsy uploads the versions after it.";
  }
  if (/caller does not have permission/i.test(error)) {
    return "Your Google Play key can't release this app yet. In Play Console's Users and permissions, give the service account permission to release to testing tracks, then try the upload again.";
  }
  if (/version code .*already been used/i.test(error)) {
    return "Google Play already has a version with this build number. Build your app again.";
  }
  return `Google Play didn't take the upload:\n${error}`;
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
