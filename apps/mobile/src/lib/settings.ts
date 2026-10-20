import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { publishedSettingsSchema, type PublishedSettings } from "@appsy/app-config";

// The runtime release in this build. A settings file that needs a newer one isn't used
// (docs/04, section 2).
export const RUNTIME_VERSION = "1.0.0";

type LivePointer = { version: number; url: string; minRuntime: string };

// Where the last downloaded design is kept on the phone.
const SAVED_KEY = "appsy.settings";

// Inside the editor's phone frame (?preview=1 on the web), the design comes from the
// editor as the merchant edits, not from the published file. Read once, at start.
export const isPreview =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("preview") === "1";

// Which live.json to load. On the web (the editor's preview), ?settings= picks it;
// otherwise it's this build's EXPO_PUBLIC_SETTINGS_URL.
function liveUrl(): string | undefined {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const fromQuery = new URLSearchParams(window.location.search).get("settings");
    if (fromQuery) return fromQuery;
  }
  return process.env.EXPO_PUBLIC_SETTINGS_URL;
}

// Reads live.json, then the version file it points at, and checks it with app-config.
export async function fetchSettings(): Promise<PublishedSettings> {
  const url = liveUrl();
  if (!url) {
    throw new Error("No design file is set. Add EXPO_PUBLIC_SETTINGS_URL to apps/mobile/.env.");
  }
  const live = (await getJson(url)) as LivePointer;
  if (isNewer(live.minRuntime, RUNTIME_VERSION)) {
    throw new Error("This design needs a newer version of the app.");
  }
  // Version files sit next to live.json (docs/04, section 4), so the app follows its own
  // address rather than the one stored in the file; a new file domain doesn't break it.
  const versionUrl = /live\.json(\?.*)?$/.test(url)
    ? url.replace(/live\.json(\?.*)?$/, `v/${live.version}.json`)
    : live.url;
  const settings = usable(await getJson(versionUrl));
  if (!settings) throw new Error("The app couldn't read its design.");
  // Kept on the phone, so the next start works even if Appsy can't be reached.
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify(settings)).catch(() => {});
  return settings;
}

// A design this build can draw: it reads as a settings file, and this runtime is new enough.
function usable(raw: unknown): PublishedSettings | null {
  const parsed = publishedSettingsSchema.safeParse(raw);
  if (!parsed.success || isNewer(parsed.data.minRuntime, RUNTIME_VERSION)) return null;
  return parsed.data;
}

// The design to show before (or instead of) a fresh download: the newer of the last one
// downloaded and the copy built into the app (app.config.js). Null on a first start without
// a built-in copy, as in the editor's preview.
export async function loadKeptSettings(): Promise<PublishedSettings | null> {
  const saved = await AsyncStorage.getItem(SAVED_KEY)
    .then((text) => (text ? usable(JSON.parse(text)) : null))
    .catch(() => null);
  const bundled = usable(Constants.expoConfig?.extra?.bundledSettings);
  if (!saved || !bundled) return saved ?? bundled;
  return saved.version >= bundled.version ? saved : bundled;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load the design (${response.status}).`);
  return response.json();
}

function isNewer(version: string, than: string) {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
