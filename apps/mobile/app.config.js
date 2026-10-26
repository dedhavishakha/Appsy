const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

// app.json holds the app's settings. This file adds what changes per build:
// - the editor's phone preview (the web build that scripts/build-preview.mjs makes, served
//   by the admin under /preview) lives under /preview;
// - every other build carries a copy of the merchant's design, so the app's very first
//   start works even when Appsy can't be reached (src/lib/settings.ts). Builds download it
//   first (scripts/fetch-build-identity.mjs); `npm run dev` writes it from your local Appsy;
// - the app's name, icon and splash screen that the merchant saved in Appsy (Publishing
//   page), which builds download first as well, into .build-identity/. Without them the name
//   is the design's app name (Expo Go shows it too), else "Appsy", with Expo's defaults.
// Plain JavaScript, so it needs no Node.js type definitions in the app's TypeScript setup.

/** Reads a JSON file next to this one, or null if it isn't there. */
function readLocal(projectRoot, path) {
  const file = join(projectRoot, path);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

// The splash picture's width in points (as the Publishing page previews it).
const SPLASH_IMAGE_WIDTH = 200;
// expo-splash-screen's Android theme always points at a splash picture, so a build without
// one fails ("drawable/splashscreen_logo not found"). Until the merchant saves an icon, this
// transparent one leaves only the background colour.
const BLANK_SPLASH = "./assets/splash-blank.png";

/**
 * @param {import("expo/config").ConfigContext} context
 * @returns {import("expo/config").ExpoConfig}
 */
module.exports = ({ config, projectRoot }) => {
  const preview = process.env.APPSY_PREVIEW_BUILD === "1";
  // The preview is public and draws the editor's design, so it carries no store's design.
  const bundledSettings = preview ? null : readLocal(projectRoot, ".bundled-settings.json");
  const identity = preview ? null : readLocal(projectRoot, ".build-identity/identity.json");
  // Designs published since 2026-10-15 carry it (app.name).
  const appName = bundledSettings?.app?.name;
  const splash = identity?.splash;
  // A merchant's builds, started by Appsy's server, carry their App ID (Publishing › Store
  // accounts) as the bundle ID and package name; without it, app.json's own test app ID.
  const appId = process.env.APPSY_APP_ID;
  return {
    ...config,
    name:
      identity?.name ||
      (typeof appName === "string" && appName ? appName : (config.name ?? "Appsy")),
    slug: config.slug ?? "appsy-by-scopegen",
    ...(identity?.icon ? { icon: identity.icon } : {}),
    ios: { ...config.ios, ...(appId ? { bundleIdentifier: appId } : {}) },
    android: {
      ...config.android,
      ...(appId ? { package: appId } : {}),
      ...(identity?.android
        ? {
            adaptiveIcon: {
              foregroundImage: identity.android.foreground,
              backgroundColor: identity.android.background,
            },
          }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []).filter(
        (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) !== "expo-splash-screen",
      ),
      [
        "expo-splash-screen",
        {
          backgroundColor: splash?.background ?? "#FFFFFF",
          image: splash?.image ?? BLANK_SPLASH,
          imageWidth: SPLASH_IMAGE_WIDTH,
        },
      ],
    ],
    experiments: {
      ...config.experiments,
      ...(preview ? { baseUrl: "/preview" } : {}),
    },
    extra: { ...config.extra, ...(bundledSettings ? { bundledSettings } : {}) },
  };
};
