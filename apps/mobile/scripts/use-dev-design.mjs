// Points the app at the design published from your local Appsy admin, then exits.
// `npm run dev` runs it before `expo start`, because the admin's dev tunnel gets a new
// address each time `shopify app dev` starts. Reads the tunnel address from Shopify CLI's
// dev bundle (a CLI-internal file) and the app id from the admin's .storage folder.
// With several test stores, it shows the one that published last; to pick another, set
// APPSY_SHOP to its myshopify.com address (PowerShell: $env:APPSY_SHOP="x.myshopify.com").
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const mobile = join(dirname(fileURLToPath(import.meta.url)), "..");
const admin = join(mobile, "..", "admin");
const manifest = join(admin, ".shopify", "dev-bundle", "manifest.json");
const published = join(admin, ".storage", "a");

if (!existsSync(manifest)) {
  console.error("Start the admin first: `npm run dev` in apps/admin.");
  process.exit(1);
}
const tunnel = readFileSync(manifest, "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];

// Every store that has published, with its latest version. Only the store's address is
// read from the file (it also holds the public Storefront token, which isn't printed).
const stores = (existsSync(published) ? readdirSync(published) : []).flatMap((id) => {
  const live = join(published, id, "live.json");
  if (!existsSync(live)) return [];
  const { version } = JSON.parse(readFileSync(live, "utf8"));
  const file = join(published, id, "v", `${version}.json`);
  const shop = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).shop?.domain : undefined;
  return [{ id, shop, publishedAt: statSync(live).mtimeMs }];
});
const wanted = process.env.APPSY_SHOP;
const store = wanted
  ? stores.find((candidate) => candidate.shop === wanted)
  : stores.sort((a, b) => b.publishedAt - a.publishedAt)[0];
const appId = store?.id;
if (!tunnel || !appId) {
  const known = stores.map((candidate) => candidate.shop).join(", ") || "none";
  console.error(
    !tunnel
      ? "Couldn't find the admin's tunnel address. Is `npm run dev` running in apps/admin?"
      : wanted
        ? `No published design for ${wanted}. Stores with one: ${known}.`
        : "Publish a design first, in Appsy's editor (App design › Customize).",
  );
  process.exit(1);
}
console.log(`Store: ${store.shop ?? appId}`);
const others = stores.filter((candidate) => candidate !== store).map((candidate) => candidate.shop);
if (others.length > 0) {
  console.log(`Other stores (set APPSY_SHOP to switch): ${others.join(", ")}`);
}

const url = `${tunnel}/cdn/a/${appId}/live.json`;
writeFileSync(
  join(mobile, ".env"),
  `# Written by scripts/use-dev-design.mjs (npm run dev). Git ignores this file.\nEXPO_PUBLIC_SETTINGS_URL=${url}\n`,
);
console.log(`Design: ${url}`);

// The published design built into the app as well (app.config.js), as store builds will be,
// so the app still opens after you stop the admin.
const live = join(published, appId, "live.json");
const version = existsSync(live) ? JSON.parse(readFileSync(live, "utf8")).version : undefined;
const versionFile = join(published, appId, "v", `${version}.json`);
if (version && existsSync(versionFile)) {
  copyFileSync(versionFile, join(mobile, ".bundled-settings.json"));
  console.log(`Built-in copy: design version ${version}`);
}
