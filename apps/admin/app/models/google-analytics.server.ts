import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  checkGoogleServices,
  type FirebaseAndroidApp,
} from "@appsy/app-config";
import db from "../db.server";

// The merchant's google-services.json for Google Analytics (app-config ga4.ts; doc 03,
// section J2), kept on their AppProject. Checked against the App ID before it's kept,
// because Google's build plugin fails when no entry has the app's package name. Builds get
// it from here (part 2), so it's never on the public CDN.

// A google-services.json is a few kilobytes.
const MAX_FILE_BYTES = 100_000;

const storedSchema = z.object({
  file: z.string().min(1),
  projectId: z.string(),
  projectNumber: z.string(),
  firebaseAppId: z.string(),
  packageName: z.string(),
  uploadedAt: z.iso.datetime(),
});

export type FirebaseConnection = FirebaseAndroidApp & { uploadedAt: string };

function readStored(value: unknown) {
  const stored = storedSchema.safeParse(value);
  return stored.success ? stored.data : null;
}

// What the Functionality page shows: the project and app the file names, without the file.
export async function loadFirebase(
  appProjectId: string,
): Promise<FirebaseConnection | null> {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: { firebase: true },
  });
  const stored = readStored(project?.firebase);
  if (!stored) return null;
  return {
    projectId: stored.projectId,
    projectNumber: stored.projectNumber,
    firebaseAppId: stored.firebaseAppId,
    packageName: stored.packageName,
    uploadedAt: stored.uploadedAt,
  };
}

// The file itself, for the app's next build (part 2). Null when there's none, or when it
// was made for another package name than the App ID builds now use.
export async function firebaseFileFor(
  appProjectId: string,
  packageName: string,
): Promise<string | null> {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: { firebase: true },
  });
  const stored = readStored(project?.firebase);
  return stored && stored.packageName === packageName ? stored.file : null;
}

// Keeps a file once it's Firebase's and names the App ID; otherwise says what's wrong in
// the merchant's words.
export async function saveFirebase(
  appProjectId: string,
  appId: string | null,
  text: string,
): Promise<string[]> {
  if (!appId) {
    return [
      "Choose your App ID on the Publishing page first: your Firebase Android app uses it as its package name.",
    ];
  }
  if (text.length > MAX_FILE_BYTES) {
    return ["This file is too large to be a google-services.json."];
  }
  const check = checkGoogleServices(text, appId);
  if (!check.ok) {
    return [
      check.problem === "other-app"
        ? `This file is for ${check.packages.join(", ")}, not your App ID ${appId}. In Google Analytics, add an Android app stream with the package name ${appId}, then download its google-services.json.`
        : "This isn't a google-services.json. Download it from your Android app stream in Google Analytics, or from your Firebase project settings.",
    ];
  }
  await db.appProject.update({
    where: { id: appProjectId },
    data: {
      firebase: {
        file: text,
        ...check.app,
        uploadedAt: new Date().toISOString(),
      },
    },
  });
  return [];
}

export async function removeFirebase(appProjectId: string): Promise<void> {
  await db.appProject.update({
    where: { id: appProjectId },
    data: { firebase: Prisma.DbNull },
  });
}
