// Building the merchant's app and uploading it for testing, on the Publishing page. Shared
// by the page (components/app-builds.tsx) and the server (models/builds.server.ts).

// starting → building → uploading → uploaded, or uploaded_draft (a release the merchant
// rolls out in Play Console); failed when the build fails, upload_failed when only the
// upload does (the app file can then be uploaded again, or by hand).
export type BuildStatus =
  | "starting"
  | "building"
  | "uploading"
  | "uploaded"
  | "uploaded_draft"
  | "upload_failed"
  | "failed";

// Builds that are still moving along.
export const ACTIVE_STATUSES: BuildStatus[] = [
  "starting",
  "building",
  "uploading",
];

export type BuildRow = {
  id: string;
  platform: string;
  status: BuildStatus;
  appVersion: string | null;
  buildNumber: string | null;
  artifactUrl: string | null;
  error: string | null;
  createdAt: string;
};

// What stands between the merchant and a build: steps left for them, or a reason builds
// can't run at all right now.
export type BuildReadiness = { missing: string[]; unavailable: string | null };

export type BuildIntent = "build-android" | "upload-again";
export type BuildResult = {
  intent: BuildIntent;
  issues: { message: string }[];
  // Shown as a toast when it worked.
  notice?: string;
};
