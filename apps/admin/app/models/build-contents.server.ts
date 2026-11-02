import { createHash } from "node:crypto";
import { z } from "zod";
import {
  APP_RELEASE,
  releaseAt,
  releasesSince,
  type AppPlatform,
} from "@appsy/app-config";
import db from "../db.server";
import {
  firebaseFileFor,
  firebaseIosFileFor,
  loadFirebase,
  loadFirebaseIos,
} from "./google-analytics.server";
import { identityKey } from "./identity.server";
import { readPublicFile } from "./storage.server";

// What each build of a merchant's app was made with, so Appsy can tell the merchant when
// their app needs a new build, and why (Publishing page and Home; decided 2026-11-02): the
// release of Appsy's app code (app-config APP_RELEASES), the app's name, icon and splash
// screen (identity.json), the platform's Firebase file, and the App ID (AppBuild.appId).
// The design isn't one of them: phones load the live design themselves.

const contentsSchema = z.object({
  release: z.number().int(),
  identity: z.string().nullable(),
  firebase: z.string().nullable(),
});
export type BuildContents = z.output<typeof contentsSchema>;

const fingerprint = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 32);

// The saved name, icon and splash screen, without the time they were saved, so saving the
// same choices again asks for no new build (picture file names change with the pictures).
function readIdentity(file: Buffer | null) {
  if (!file) return { fingerprint: null, savedAt: null };
  try {
    const { updatedAt, ...choices } = JSON.parse(file.toString("utf8")) as {
      updatedAt?: unknown;
    };
    const savedAt = typeof updatedAt === "string" ? new Date(updatedAt) : null;
    return {
      fingerprint: fingerprint(JSON.stringify(choices)),
      savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
    };
  } catch {
    return { fingerprint: fingerprint(file.toString("utf8")), savedAt: null };
  }
}

// What a build started now gets: identity.json as the build downloads it, and the Firebase
// file it includes for its platform (or none).
export function buildContents(
  identityFile: Buffer | null,
  firebaseFile: string | null,
): BuildContents {
  return {
    release: APP_RELEASE,
    identity: readIdentity(identityFile).fingerprint,
    firebase: firebaseFile ? fingerprint(firebaseFile) : null,
  };
}

const firebaseReason: Record<AppPlatform, string> = {
  android:
    "You uploaded a Firebase file, for Google Analytics and notifications.",
  ios: "You uploaded a Firebase file, for Google Analytics.",
};

// What changed since the platform's latest build (one that's moving along or made an app):
// empty when that build has everything, or when the app was never built.
export async function rebuildReasons(
  appProjectId: string,
  platform: AppPlatform,
  appId: string | null,
): Promise<string[]> {
  const last = await db.appBuild.findFirst({
    where: { appProjectId, platform, status: { not: "failed" } },
    orderBy: { createdAt: "desc" },
    select: { appId: true, contents: true, createdAt: true },
  });
  if (!last) return [];
  const [identityFile, firebaseFile, firebase] = await Promise.all([
    readPublicFile(identityKey(appProjectId)),
    appId
      ? platform === "ios"
        ? firebaseIosFileFor(appProjectId, appId)
        : firebaseFileFor(appProjectId, appId)
      : null,
    platform === "ios"
      ? loadFirebaseIos(appProjectId)
      : loadFirebase(appProjectId),
  ]);
  const now = buildContents(identityFile, firebaseFile);
  const then = contentsSchema.safeParse(last.contents);

  // Builds that didn't record their release got the one out when they started.
  const reasons = releasesSince(
    then.success ? then.data.release : releaseAt(last.createdAt),
    platform,
  ).map((entry) => `Appsy's app was updated: ${entry.change}.`);
  if (appId && appId !== last.appId) {
    reasons.push(`Your App ID changed to ${appId}.`);
  }
  if (then.success) {
    if (now.identity !== then.data.identity) {
      reasons.push("You changed your app name, icon or splash screen.");
    }
    if (now.firebase !== then.data.firebase) {
      reasons.push(
        now.firebase
          ? firebaseReason[platform]
          : "You removed your Firebase file.",
      );
    }
    return reasons;
  }
  // Built before Appsy recorded what builds contain: what was saved after it started.
  const identitySavedAt = readIdentity(identityFile).savedAt;
  if (identitySavedAt && identitySavedAt > last.createdAt) {
    reasons.push("You changed your app name, icon or splash screen.");
  }
  if (
    now.firebase &&
    firebase &&
    new Date(firebase.uploadedAt) > last.createdAt
  ) {
    reasons.push(firebaseReason[platform]);
  }
  return reasons;
}

// The same for both platforms, for the Publishing page and Home.
export async function appRebuildReasons(
  appProjectId: string,
  appIds: { android: string | null; ios: string | null },
): Promise<Record<AppPlatform, string[]>> {
  const [android, ios] = await Promise.all([
    rebuildReasons(appProjectId, "android", appIds.android),
    rebuildReasons(appProjectId, "ios", appIds.ios),
  ]);
  return { android, ios };
}
