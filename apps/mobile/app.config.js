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
//   is the design's app name (Expo Go shows it too), else "Appsy", with Expo's defaults;
// - Firebase, for Google Analytics (and Android push notifications), only when the
//   merchant's Firebase file for the platform being built is here: Appsy's server gives an
//   Android build only google-services.json and an iPhone build only
//   GoogleService-Info.plist (fetch-build-identity.mjs writes them). React Native Firebase's
//   Expo plugin stops a build without the file, and react-native.config.js leaves its native
//   code out without it. On iPhone it also needs dynamic frameworks (expo-build-properties;
//   https://rnfirebase.io/ios-spm);
// - notifications (expo-notifications) in every build: the bag reminder needs no Firebase.
//   Android draws the small icon as a white shape, tinted with the store's brand colour. A
//   merchant's iPhone builds go to TestFlight and the App Store, so their push entitlement
//   is "production";
// - the address Shopify's sign-in page returns to (shopper accounts), in every build Appsy's
//   server starts: Shopify requires a mobile client's callback scheme to be
//   shop.{shop_id}.*, so the build registers shop.<the store's ID>.appsy
//   (packages/app-config/src/accounts.ts makes the same callback for the merchant to enter).
//   It's there even while the store has accounts off, so switching them on needs no build.
// No build uses the phone's advertising ID, so its permission is removed from every build.
// Plain JavaScript, so it needs no Node.js type definitions in the app's TypeScript setup.
// A change to the app's code that merchants should get (a feature, a fix they'd notice, a new
// Apple or Google requirement) also needs an entry in packages/app-config/src/app-releases.ts,
// so Appsy tells them their app needs a new build.

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
// The merchant's Firebase files (react-native.config.js looks for the same ones).
const GOOGLE_SERVICES = "./.google-services.json";
const GOOGLE_SERVICES_IOS = "./.GoogleService-Info.plist";
// Firebase's SDK adds it; Expo's blockedPermissions removes it from the final manifest.
const AD_ID_PERMISSION = "com.google.android.gms.permission.AD_ID";
// Expo: "96x96 all-white png with transparency".
const NOTIFICATION_ICON = "./assets/notification-icon.png";
// The app's one notification channel (PUSH_CHANNEL in packages/app-config/src/push.ts).
const NOTIFICATION_CHANNEL = "offers";
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
// A store's ID, the number in its Shopify ID (APPSY_SHOP_ID, from Appsy's server).
const SHOP_ID = /^\d+$/;

// Apple's "required reason" APIs that the app's native libraries use, copied from their own
// PrivacyInfo.xcprivacy files: Expo says Apple doesn't read every library's file in these
// builds (https://docs.expo.dev/guides/apple-privacy/). Checked 2026-10-31 against React
// Native, AsyncStorage and expo-application, -constants, -file-system, -localization and
// -notifications; on 2026-11-02 expo-secure-store and expo-crypto had no such file (and none
// of those APIs in their iPhone code), and expo-auth-session has no native code. A new native
// library means checking its file again.
const PRIVACY_MANIFEST = {
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
      NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
      NSPrivacyAccessedAPITypeReasons: ["C617.1", "0A2A.1", "3B52.1"],
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
      NSPrivacyAccessedAPITypeReasons: ["E174.1", "85F4.1"],
    },
    {
      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
      NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
    },
  ],
};

// iPhone builds with Firebase (the merchant's GoogleService-Info.plist) add Firebase's own
// reasons for UserDefaults: C56D.1 (GoogleUtilities) and 1C8F.1 (FirebaseCoreInternal), from
// their PrivacyInfo.xcprivacy files in Google's GoogleUtilities and firebase-ios-sdk
// repositories (checked 2026-11-02). Their file timestamps reason, C617.1, is above already.
const FIREBASE_USER_DEFAULTS_REASONS = ["C56D.1", "1C8F.1"];

function privacyManifest(firebaseIos) {
  if (!firebaseIos) return PRIVACY_MANIFEST;
  return {
    NSPrivacyAccessedAPITypes: PRIVACY_MANIFEST.NSPrivacyAccessedAPITypes.map((entry) =>
      entry.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults"
        ? {
            ...entry,
            NSPrivacyAccessedAPITypeReasons: [
              ...entry.NSPrivacyAccessedAPITypeReasons,
              ...FIREBASE_USER_DEFAULTS_REASONS,
            ],
          }
        : entry,
    ),
  };
}

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
  const firebaseAndroid = !preview && existsSync(join(projectRoot, GOOGLE_SERVICES));
  const firebaseIos = !preview && existsSync(join(projectRoot, GOOGLE_SERVICES_IOS));
  const brand = bundledSettings?.theme?.colors?.brand;
  const shopId = process.env.APPSY_SHOP_ID;
  const accountScheme = !preview && shopId && SHOP_ID.test(shopId) ? `shop.${shopId}.appsy` : null;
  return {
    ...config,
    name:
      identity?.name ||
      (typeof appName === "string" && appName ? appName : (config.name ?? "Appsy")),
    slug: config.slug ?? "appsy-by-scopegen",
    // app.json's own scheme stays first: links the app makes use it.
    ...(accountScheme ? { scheme: [...[config.scheme ?? []].flat(), accountScheme] } : {}),
    ...(identity?.icon ? { icon: identity.icon } : {}),
    ios: {
      ...config.ios,
      ...(appId ? { bundleIdentifier: appId } : {}),
      ...(firebaseIos ? { googleServicesFile: GOOGLE_SERVICES_IOS } : {}),
      // The app uses only the encryption built into iOS (HTTPS), so App Store Connect
      // needn't ask about export compliance for each build.
      config: { ...config.ios?.config, usesNonExemptEncryption: false },
      privacyManifests: { ...config.ios?.privacyManifests, ...privacyManifest(firebaseIos) },
    },
    android: {
      ...config.android,
      ...(appId ? { package: appId } : {}),
      ...(firebaseAndroid ? { googleServicesFile: GOOGLE_SERVICES } : {}),
      blockedPermissions: [...(config.android?.blockedPermissions ?? []), AD_ID_PERMISSION],
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
      ...(firebaseAndroid || firebaseIos ? ["@react-native-firebase/app"] : []),
      ...(firebaseIos ? [["expo-build-properties", { ios: { useFrameworks: "dynamic" } }]] : []),
      [
        "expo-notifications",
        {
          icon: NOTIFICATION_ICON,
          ...(typeof brand === "string" && HEX_COLOUR.test(brand) ? { color: brand } : {}),
          defaultChannel: NOTIFICATION_CHANNEL,
          ...(appId ? { mode: "production" } : {}),
        },
      ],
    ],
    experiments: {
      ...config.experiments,
      ...(preview ? { baseUrl: "/preview" } : {}),
    },
    // `firebase`: whether this build has Firebase, so the app only reaches for it then
    // (src/lib/ga4.native.ts, src/lib/notifications.native.ts).
    extra: {
      ...config.extra,
      ...(bundledSettings ? { bundledSettings } : {}),
      firebase: firebaseAndroid || firebaseIos,
    },
  };
};
