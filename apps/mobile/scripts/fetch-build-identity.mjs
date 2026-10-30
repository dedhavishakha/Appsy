// Downloads what a build of the merchant's app needs from Appsy before Expo builds it: the
// published design, built in as the app's first-start copy (.bundled-settings.json), and
// the app's name, icon and splash screen (.build-identity/), which app.config.js reads.
// Expo runs it on its build servers before installing packages (the eas-build-pre-install
// hook in package.json, ahead of `expo prebuild`), so it uses only Node's built-ins.
// `npm run build-identity` runs it on this computer, to see what a build would get.
//
// The address is EXPO_PUBLIC_SETTINGS_URL, from the build profile in eas.json. Without
// one, the build has no store's design, name or icon, like the editor's preview.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const mobile = join(dirname(fileURLToPath(import.meta.url)), "..");
const identityDir = join(mobile, ".build-identity");
const settingsUrl = process.env.EXPO_PUBLIC_SETTINGS_URL;

// 0. The merchant's google-services.json, when they connected Google Analytics. Appsy's
// server puts it in the build profile's APPSY_GOOGLE_SERVICES (base64); app.config.js and
// react-native.config.js include Firebase only when the file is here.
const googleServices = join(mobile, ".google-services.json");
await rm(googleServices, { force: true });
if (process.env.APPSY_GOOGLE_SERVICES) {
  const file = Buffer.from(process.env.APPSY_GOOGLE_SERVICES, "base64").toString("utf8");
  try {
    JSON.parse(file);
  } catch {
    fail("APPSY_GOOGLE_SERVICES isn't a google-services.json.");
  }
  await writeFile(googleServices, file);
  console.log("Google Analytics: the merchant's Firebase file is included.");
}

if (!settingsUrl) {
  console.log("No EXPO_PUBLIC_SETTINGS_URL: building without a store's design, name or icon.");
  process.exit(0);
}
if (!/\/live\.json(\?.*)?$/.test(settingsUrl)) {
  fail(`EXPO_PUBLIC_SETTINGS_URL should end in /live.json, not ${settingsUrl}`);
}
const base = settingsUrl.replace(/live\.json(\?.*)?$/, "");

// 1. The live design, built into the app so its first start works offline.
const live = await getJson(settingsUrl);
if (!Number.isInteger(live?.version)) fail("live.json has no version number.");
const design = await getJson(`${base}v/${live.version}.json`);
await writeFile(join(mobile, ".bundled-settings.json"), JSON.stringify(design));
console.log(`Built-in design: version ${live.version} of ${design?.shop?.domain ?? "the store"}`);

// 2. The app's name, icon and splash screen, once the merchant has saved them in Appsy.
await rm(identityDir, { recursive: true, force: true });
const identity = await getJson(`${base}identity.json`, { optional: true });
if (!identity) {
  console.log("No app name and icon saved in Appsy yet: the build uses the defaults.");
  process.exit(0);
}
if (identity.schemaVersion !== 1) {
  fail(`identity.json is version ${identity.schemaVersion}; this script reads version 1.`);
}
if (typeof identity.name !== "string" || !identity.name.trim() || identity.name.length > 30) {
  fail("identity.json has no usable app name.");
}
await mkdir(identityDir, { recursive: true });

// Each picture is saved next to identity.json, under the name Appsy gave it.
async function picture(path) {
  if (!path) return null;
  if (!/^identity\/[a-z-]+-[0-9a-f]{12}\.png$/.test(path)) {
    fail(`identity.json names an unexpected picture: ${path}`);
  }
  const name = path.slice("identity/".length);
  await writeFile(join(identityDir, name), await getBytes(base + path));
  return `./.build-identity/${name}`;
}

const result = {
  name: identity.name.trim(),
  icon: await picture(identity.icon),
  android: identity.android
    ? {
        foreground: await picture(identity.android.foreground),
        background: identity.android.background,
      }
    : null,
  splash: {
    image: await picture(identity.splash?.image),
    background: identity.splash?.background ?? "#FFFFFF",
  },
};
await writeFile(join(identityDir, "identity.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `App name and icon: "${result.name}"` +
    `${result.icon ? ", icon" : ""}${result.splash.image ? ", splash picture" : ""}`,
);

async function getJson(url, { optional = false } = {}) {
  const response = await download(url);
  if (optional && response.status === 404) return null;
  if (!response.ok) fail(`${url} answered ${response.status}.`);
  return response.json();
}

async function getBytes(url) {
  const response = await download(url);
  if (!response.ok) fail(`${url} answered ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

// A second try, in case of a brief network hiccup on the build server.
async function download(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt >= 2) fail(`Couldn't reach ${url}: ${error.cause?.code ?? error.message}`);
    }
  }
}

// A build without the merchant's design or icon would look broken, so it stops instead.
function fail(message) {
  console.error(message);
  process.exit(1);
}
