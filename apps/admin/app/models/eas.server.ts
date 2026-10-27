import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { GoogleServiceAccount } from "./vault.server";

// Runs Expo's command-line tool (EAS CLI) for merchants' apps (models/builds.server.ts).
// Builds and uploads work in a temporary copy of the phone app (the root package files,
// packages/ and apps/mobile) whose eas.json carries that merchant's build and submit
// profiles. EAS packs the copy without git (EAS_NO_VCS, with EAS_PROJECT_ROOT at the copy),
// builds on Expo's servers, and uploads with the merchant's own Google key.
//
// The CLI reads the app's settings with the phone app's installed packages, so the copy
// links to the repository's node_modules folders (never packed: EAS always leaves
// node_modules out). It signs in with EXPO_TOKEN, a robot user's token from the server's
// secret, or on a developer's computer with their own `eas login`. It gets only the
// environment it needs, never the database login or Shopify secrets.

// The repository root: /repo in the Docker image, the Appsy folder on a laptop.
const REPO_ROOT = resolve(
  process.env.APPSY_REPO_ROOT ?? join(process.cwd(), "..", ".."),
);
const MOBILE = join("apps", "mobile");
const BUILD_PROFILE = "appsy-merchant";
const SUBMIT_PROFILE = "appsy-merchant";
const DRAFT_SUBMIT_PROFILE = "appsy-merchant-draft";

// Left out of every copy: installs, local builds, and files with local settings or a
// store's design. The build downloads the merchant's design and icon itself
// (apps/mobile/scripts/fetch-build-identity.mjs).
const SKIPPED = new Set([
  "node_modules",
  ".expo",
  "dist",
  "web-build",
  ".build-identity",
  ".bundled-settings.json",
  ".git",
]);

// The CLI's environment: what it needs to run and sign in, nothing else.
const PASSED_ENV = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "EXPO_TOKEN",
]);

const EAS_BUILD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The merchant's App ID (package name) and the address of their published design.
export type MerchantApp = { appId: string; settingsUrl: string };

// What `eas build --json` and `eas build:view --json` say about a build.
export type EasBuild = {
  id: string;
  status: string;
  appVersion?: string | null;
  appBuildVersion?: string | null;
  artifacts?: { applicationArchiveUrl?: string | null } | null;
  error?: { message?: string | null; errorCode?: string | null } | null;
};

type Run = { code: number; stdout: string; stderr: string };

async function workspace(
  kind: string,
  app: MerchantApp,
  googleKey?: GoogleServiceAccount,
) {
  const root = join(tmpdir(), "appsy-builds", `${kind}-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    for (const file of ["package.json", "package-lock.json", ".gitignore"]) {
      if (existsSync(join(REPO_ROOT, file))) {
        await cp(join(REPO_ROOT, file), join(root, file));
      }
    }
    const filter = (source: string) => {
      const name = basename(source);
      return !SKIPPED.has(name) && !name.startsWith(".env");
    };
    for (const dir of ["packages", MOBILE]) {
      await cp(join(REPO_ROOT, dir), join(root, dir), {
        recursive: true,
        filter,
      });
    }
    for (const dir of await installedDirs()) {
      // A junction on Windows needs no special rights; elsewhere a plain link.
      await symlink(
        join(REPO_ROOT, dir, "node_modules"),
        join(root, dir, "node_modules"),
        process.platform === "win32" ? "junction" : "dir",
      );
    }

    const easFile = join(root, MOBILE, "eas.json");
    const eas = JSON.parse(await readFile(easFile, "utf8")) as {
      build?: Record<string, unknown>;
      submit?: Record<string, unknown>;
    };
    eas.build = {
      ...eas.build,
      [BUILD_PROFILE]: {
        distribution: "store",
        autoIncrement: true,
        env: {
          EXPO_PUBLIC_SETTINGS_URL: app.settingsUrl,
          APPSY_APP_ID: app.appId,
        },
        android: { buildType: "app-bundle" },
      },
    };
    if (googleKey) {
      // Only uploads get the key, in their own copy, deleted when they end.
      const keyPath = join(root, "google-service-account.json");
      await writeFile(keyPath, JSON.stringify(googleKey), { mode: 0o600 });
      const android = { track: "internal", serviceAccountKeyPath: keyPath };
      eas.submit = {
        ...eas.submit,
        [SUBMIT_PROFILE]: { android },
        // For when Google Play takes only draft releases (an app never published).
        [DRAFT_SUBMIT_PROFILE]: {
          android: { ...android, releaseStatus: "draft" },
        },
      };
    }
    await writeFile(easFile, `${JSON.stringify(eas, null, 2)}\n`);
    return root;
  } catch (error) {
    await removeWorkspace(root);
    throw error;
  }
}

// The repository's install folders: the root one, and those of the phone app and the
// packages when npm put some of their packages there.
async function installedDirs() {
  const packages = await readdir(join(REPO_ROOT, "packages")).catch(() => []);
  return ["", MOBILE, ...packages.map((name) => join("packages", name))].filter(
    (dir) => existsSync(join(REPO_ROOT, dir, "node_modules")),
  );
}

// Removes the links first, so deleting the copy never reaches the repository's installs.
async function removeWorkspace(root: string) {
  for (const dir of await installedDirs()) {
    const link = join(root, dir, "node_modules");
    const stats = await lstat(link).catch(() => null);
    if (stats?.isSymbolicLink()) await unlink(link);
  }
  await rm(root, { recursive: true, force: true });
}

function runEas(
  args: string[],
  root: string,
  appId: string | null,
  timeoutMs: number,
) {
  const env: NodeJS.ProcessEnv = {
    EAS_NO_VCS: "1",
    EAS_PROJECT_ROOT: root,
    CI: "1",
    // apps/mobile/app.config.js: the merchant's package name instead of the test app's.
    ...(appId ? { APPSY_APP_ID: appId } : {}),
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && PASSED_ENV.has(key.toUpperCase()))
      env[key] = value;
  }
  return new Promise<Run>((done) => {
    // On Windows the CLI is a .cmd script, which Node runs only through a shell. Every
    // argument is Appsy's own or a checked build ID, so none needs quoting.
    const child = spawn(
      process.platform === "win32" ? "eas.cmd" : "eas",
      args,
      {
        cwd: join(root, MOBILE),
        env,
        shell: process.platform === "win32",
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? -1, stdout, stderr });
    });
  });
}

// The last lines of the CLI's output, which say why it stopped.
function lastLines(run: Run, count = 8) {
  return `${run.stderr}\n${run.stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count)
    .join("\n");
}

// Starts an Android build (an .aab for Google Play) and returns once Expo has the project.
export async function startAndroidBuild(app: MerchantApp) {
  const root = await workspace("build", app);
  try {
    const run = await runEas(
      [
        "build",
        "--platform",
        "android",
        "--profile",
        BUILD_PROFILE,
        "--non-interactive",
        "--no-wait",
        "--json",
      ],
      root,
      app.appId,
      15 * 60_000,
    );
    const build = parseBuilds(run.stdout)[0];
    if (run.code !== 0 || !build) {
      return { error: lastLines(run) || "Expo didn't start the build." };
    }
    return { build };
  } finally {
    await removeWorkspace(root);
  }
}

// A build's status, read from the repository's own copy of the phone app (it only needs
// the project's ID); null when Expo couldn't be asked.
export async function viewBuild(easBuildId: string) {
  if (!EAS_BUILD_ID.test(easBuildId))
    throw new Error(`Bad build ID "${easBuildId}"`);
  const run = await runEas(
    ["build:view", easBuildId, "--json"],
    REPO_ROOT,
    null,
    2 * 60_000,
  );
  if (run.code !== 0) {
    console.error(`eas build:view ${easBuildId}:`, lastLines(run, 3));
    return null;
  }
  return parseBuilds(run.stdout)[0] ?? null;
}

// Uploads a finished build to Google Play's internal testing track and waits for Google
// Play's answer. When Google Play takes only draft releases, uploads it as a draft, which
// the merchant rolls out in Play Console. An error is the CLI's whole output, for the
// server's log; builds.server.ts turns it into a message for the merchant.
export async function submitToGooglePlay(
  easBuildId: string,
  app: MerchantApp,
  googleKey: GoogleServiceAccount,
): Promise<{ draft: boolean } | { error: string }> {
  if (!EAS_BUILD_ID.test(easBuildId))
    throw new Error(`Bad build ID "${easBuildId}"`);
  const root = await workspace("submit", app, googleKey);
  try {
    const submit = (profile: string) =>
      runEas(
        [
          "submit",
          "--platform",
          "android",
          "--profile",
          profile,
          "--id",
          easBuildId,
          "--non-interactive",
        ],
        root,
        app.appId,
        30 * 60_000,
      );
    const output = (run: Run) => `${run.stdout}\n${run.stderr}`;
    const first = await submit(SUBMIT_PROFILE);
    if (first.code === 0) return { draft: false };
    // The first try is a completed release, so "draft" in its answer means Google Play
    // takes only drafts for this app, whether in Google's words ("Only releases with
    // status draft may be created on draft app") or Expo's own (eas-cli prints its message
    // for errors it knows, not Google's).
    if (!/\bdraft\b/i.test(output(first))) return { error: output(first) };
    const draft = await submit(DRAFT_SUBMIT_PROFILE);
    return draft.code === 0 ? { draft: true } : { error: output(draft) };
  } finally {
    await removeWorkspace(root);
  }
}

// The JSON the CLI prints: one build, or a list of them.
function parseBuilds(stdout: string): EasBuild[] {
  const start = stdout.search(/[[{]/);
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(stdout.slice(start)) as EasBuild | EasBuild[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}
