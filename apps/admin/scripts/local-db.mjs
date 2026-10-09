// Starts, stops or checks Appsy's local development PostgreSQL server.
// The server lives in ~/.appsy-postgres (outside the repo) and listens on localhost:5433.
// Usage: npm run db:start | npm run db:stop | npm run db:status
// `npm run dev` runs db:start first (the predev script), so the database is always up for dev.
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const root = join(homedir(), ".appsy-postgres");
const dataDir = join(root, "data");
const logFile = join(root, "server.log");

function pgCtl(args, stdio = "inherit") {
  const result = spawnSync("pg_ctl", args, { stdio });
  if (result.error) {
    console.error("Could not run pg_ctl. Is PostgreSQL's bin folder on PATH?");
  }
  return result.status ?? 1;
}

function isRunning() {
  return pgCtl(["status", "-D", dataDir], "ignore") === 0;
}

// Windows stops console programs on Ctrl+C or when their window closes, which stopped
// the server on 2026-10-09. So pg_ctl starts in its own hidden console window, which the
// server inherits, and closing the terminal or VS Code no longer stops it.
function startInHiddenWindow() {
  const quote = (path) => `'"${path.replaceAll("'", "''")}"'`;
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$p = Start-Process -FilePath 'pg_ctl' -ArgumentList @('start', '-D', ${quote(dataDir)}, '-l', ${quote(logFile)}, '-w') -WindowStyle Hidden -PassThru`,
    "$null = $p.Handle",
    "$p.WaitForExit()",
    "exit $p.ExitCode",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { stdio: "inherit" },
  );
  return result.status ?? 1;
}

const command = process.argv[2];

if (command === "start") {
  if (isRunning()) {
    console.log("Appsy's database is already running.");
    process.exit(0);
  }
  if (startInHiddenWindow() !== 0) {
    console.error(`Could not start Appsy's database. See ${logFile}`);
    process.exit(1);
  }
  process.exit(pgCtl(["status", "-D", dataDir]));
} else if (command === "stop") {
  process.exit(pgCtl(["stop", "-D", dataDir, "-m", "fast", "-w"]));
} else if (command === "status") {
  process.exit(pgCtl(["status", "-D", dataDir]));
} else {
  console.error("Usage: node scripts/local-db.mjs start|stop|status");
  process.exit(1);
}
