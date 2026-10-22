import { z } from "zod";
import { hexColor, imageValue } from "@appsy/app-config";

// The app's name, icon and splash screen choices, shared by the Publishing page
// (components/app-identity.tsx) and the server that turns them into build files
// (models/identity.server.ts).

export const identitySchema = z.object({
  icon: imageValue.nullable(),
  iconBackground: hexColor,
  splashImage: imageValue.nullable(),
  splashBackground: hexColor,
});

export type IdentitySettings = z.output<typeof identitySchema>;

export const DEFAULT_IDENTITY: IdentitySettings = {
  icon: null,
  iconBackground: "#FFFFFF",
  splashImage: null,
  splashBackground: "#FFFFFF",
};

export type IdentityField = "appName" | keyof IdentitySettings;
export type IdentityIssue = { field: IdentityField | null; message: string };

// Google Play allows app names of up to 30 characters (AppProject.appName).
export const APP_NAME_MAX = 30;

// Apple and Expo: one exactly square 1024 × 1024 icon that fills the square with no
// transparency; the phone rounds the corners
// (https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).
export const ICON_SIZE = 1024;

// Android: icon layers are 108 × 108 dp and only the inner 66 × 66 dp is never clipped by
// a launcher's mask, so the icon sits inside it on the background colour. The outer 18 dp
// on each side is reserved for masking, so phones show the inner 72 × 72 dp
// (https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
export const ANDROID_SAFE_RATIO = 66 / 108;
export const ANDROID_SHOWN_RATIO = 66 / 72;

// The splash picture's width on the phone, in points (apps/mobile/app.config.js).
export const SPLASH_IMAGE_WIDTH = 200;
