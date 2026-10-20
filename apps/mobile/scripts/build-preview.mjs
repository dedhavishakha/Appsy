// Builds the editor's phone preview: this app's web build, which the admin serves under
// /preview (apps/admin/app/routes/preview.$.tsx). Run it again after changing the app.
// With --if-stale (the admin's `npm run dev`), it only builds when there's no preview yet,
// or the app or the packages it's built from changed since: an older preview can't read
// designs in a newer format.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const mobile = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(mobile, "..", "admin", ".preview");
const packages = join(mobile, "..", "..", "packages");

// The newest change time of a file or folder's files, skipping installed modules.
function newest(path) {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(path)
    .filter((name) => name !== "node_modules")
    .reduce((latest, name) => Math.max(latest, newest(join(path, name))), 0);
}

function upToDate() {
  const built = join(output, "index.html");
  if (!existsSync(built)) return false;
  const sources = [
    join(mobile, "src"),
    join(mobile, "app.json"),
    join(mobile, "app.config.js"),
    join(mobile, "package.json"),
    ...readdirSync(packages).flatMap((name) => [
      join(packages, name, "src"),
      join(packages, name, "package.json"),
    ]),
  ];
  return Math.max(...sources.map(newest)) <= statSync(built).mtimeMs;
}

if (process.argv.includes("--if-stale") && upToDate()) {
  process.exit(0);
}

console.log("Building the editor's phone preview…");
rmSync(output, { recursive: true, force: true });
const expo = createRequire(import.meta.url).resolve("expo/bin/cli");
const result = spawnSync(
  process.execPath,
  [expo, "export", "--platform", "web", "--output-dir", output],
  {
    cwd: mobile,
    stdio: "inherit",
    // app.config.js serves the build from /preview when this is set.
    env: { ...process.env, APPSY_PREVIEW_BUILD: "1" },
  },
);
process.exit(result.status ?? 1);
