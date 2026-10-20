const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

// app.json holds the app's settings. This file adds three things:
// - the editor's phone preview (the web build that scripts/build-preview.mjs makes, served
//   by the admin under /preview) lives under /preview;
// - every other build carries a copy of the merchant's design, so the app's very first
//   start works even when Appsy can't be reached (src/lib/settings.ts). The build writes
//   .bundled-settings.json first; `npm run dev` writes it from your local Appsy;
// - that copy names the app: the merchant's app name (Expo Go shows it too), else "Appsy".
// Plain JavaScript, so it needs no Node.js type definitions in the app's TypeScript setup.

/**
 * @param {import("expo/config").ConfigContext} context
 * @returns {import("expo/config").ExpoConfig}
 */
module.exports = ({ config, projectRoot }) => {
  const preview = process.env.APPSY_PREVIEW_BUILD === "1";
  const bundledFile = join(projectRoot, ".bundled-settings.json");
  // The preview is public and draws the editor's design, so it carries no store's design.
  const bundledSettings =
    !preview && existsSync(bundledFile) ? JSON.parse(readFileSync(bundledFile, "utf8")) : null;
  // Designs published since 2026-10-15 carry it (app.name).
  const appName = bundledSettings?.app?.name;
  return {
    ...config,
    name: typeof appName === "string" && appName ? appName : (config.name ?? "Appsy"),
    slug: config.slug ?? "appsy-runtime",
    experiments: {
      ...config.experiments,
      ...(preview ? { baseUrl: "/preview" } : {}),
    },
    extra: { ...config.extra, ...(bundledSettings ? { bundledSettings } : {}) },
  };
};
