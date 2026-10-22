// Writes src/lib/licences.json, the notices the app's "Open-source licences" screen shows
// (app/licences.tsx). Every app carries the Theme settings fonts (SIL Open Font License 1.1,
// condition 2: each copy contains the copyright notice and the licence) and the Ionicons icons
// (MIT: the notice and permission text in all copies). Run `npm run licences` after adding or
// removing a font in packages/app-config/src/theme.ts, and commit the file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const mobile = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(mobile, "..", "..");

// The fonts merchants can choose: FONT_OPTIONS' keys in app-config, apart from "System".
const theme = readFileSync(join(root, "packages", "app-config", "src", "theme.ts"), "utf8");
const block = theme.match(/export const FONT_OPTIONS = \{([\s\S]*?)\} as const/)?.[1];
if (!block) fail("Couldn't find FONT_OPTIONS in packages/app-config/src/theme.ts.");
const families = [...block.matchAll(/^\s*"?([A-Za-z ]+?)"?\s*:/gm)]
  .map((match) => match[1])
  .filter((family) => family !== "System");

const text = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
function packageDir(name) {
  for (const base of [mobile, root]) {
    const dir = join(base, "node_modules", name);
    if (existsSync(dir)) return dir;
  }
  fail(`${name} isn't installed. Run npm install at the repository root.`);
}

const items = [];
let ofl;
for (const family of families) {
  const name = `@expo-google-fonts/${family.toLowerCase().replace(/ /g, "-")}`;
  const licence = text(join(packageDir(name), "LICENSE_FONT"));
  const split = licence.indexOf("This Font Software is licensed");
  const start = licence.indexOf("SIL OPEN FONT LICENSE Version 1.1");
  if (split === -1 || start === -1) fail(`${name}'s LICENSE_FONT isn't the SIL Open Font License.`);
  // The licence text itself is the same in every package; only the notices differ.
  const body = licence.slice(start).trim();
  if (ofl && ofl.replace(/\s+/g, " ") !== body.replace(/\s+/g, " ")) {
    fail(`${name}'s licence text differs from the others; show it separately.`);
  }
  ofl ??= body;
  items.push({ name: family, notice: licence.slice(0, split).trim(), licence: "OFL-1.1" });
}

// Ionicons' notice comes from its own repository (github.com/ionic-team/ionicons, LICENSE);
// the icons reach the app through @expo/vector-icons, which has its own MIT notice.
const vectorIcons = text(join(packageDir("@expo/vector-icons"), "LICENSE"));
const permission = vectorIcons.indexOf("Permission is hereby granted");
if (permission === -1) fail("@expo/vector-icons' LICENSE isn't the MIT licence.");
items.push({
  name: "Ionicons",
  notice: "Copyright (c) 2015-present Ionic (http://ionic.io/)",
  licence: "MIT",
});
items.push({
  name: "@expo/vector-icons",
  notice: vectorIcons
    .slice(0, permission)
    .replace("The MIT License (MIT)", "")
    .trim(),
  licence: "MIT",
});

const mit = `The MIT License (MIT)\n\n${vectorIcons.slice(permission).trim()}`;
writeFileSync(
  join(mobile, "src", "lib", "licences.json"),
  `${JSON.stringify({ items, texts: { "OFL-1.1": ofl, MIT: mit } }, null, 2)}\n`,
);
console.log(`Wrote src/lib/licences.json: ${items.map((item) => item.name).join(", ")}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
