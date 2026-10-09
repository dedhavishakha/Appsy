// Points the app at the design published from your local Appsy admin, then exits.
// `npm run dev` runs it before `expo start`, because the admin's dev tunnel gets a new
// address each time `shopify app dev` starts. Reads the tunnel address from Shopify CLI's
// dev bundle (a CLI-internal file) and the app id from the admin's .storage folder.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const appId = existsSync(published) ? readdirSync(published)[0] : undefined;
if (!tunnel || !appId) {
  console.error(
    tunnel
      ? "Publish a design first, on Appsy's Home screen page."
      : "Couldn't find the admin's tunnel address. Is `npm run dev` running in apps/admin?",
  );
  process.exit(1);
}

const url = `${tunnel}/cdn/a/${appId}/live.json`;
writeFileSync(
  join(mobile, ".env"),
  `# Written by scripts/use-dev-design.mjs (npm run dev). Git ignores this file.\nEXPO_PUBLIC_SETTINGS_URL=${url}\n`,
);
console.log(`Design: ${url}`);
