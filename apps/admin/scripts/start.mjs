// Starts Appsy's admin in its container (apps/admin/Dockerfile): finds the database, runs
// `prisma generate` and `prisma migrate deploy`, then serves the app on PORT (3000 inside
// the container; the EC2 server publishes it as 3001).
//
// The database login comes from AWS Secrets Manager, named by AWS_REGION and AWS_SECRET_ARN
// and read with the EC2 server's IAM role, so no password is written in the project or the
// image. A DATABASE_URL that's already set (local development) is used as it is.
//
// `node scripts/start.mjs --check` only checks that the secret can be read and the database
// reached, and lists the secret's field names. It never prints values.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Fields the secret may hold besides the database login, so they needn't sit in an env file.
// EXPO_TOKEN is the Expo robot user's token, which merchants' builds run with
// (app/models/eas.server.ts).
const EXTRA_SECRETS = ["SHOPIFY_API_SECRET", "EXPO_TOKEN"];

async function readSecret() {
  const { AWS_REGION: region, AWS_SECRET_ARN: secretId } = process.env;
  if (!region || !secretId) {
    throw new Error("Set DATABASE_URL, or AWS_REGION and AWS_SECRET_ARN.");
  }
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");
  // Credentials come from the EC2 server's IAM role (instance metadata), never from files.
  const client = new SecretsManagerClient({ region });
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  if (!SecretString) throw new Error("The secret has no text value.");
  return SecretString.trim();
}

// A connection string from the shapes Secrets Manager uses: a ready URL, or the JSON it
// stores for RDS ("username", "password", "host", "port", "dbname"). Secrets that RDS
// manages itself hold only the username and password; DB_HOST, DB_PORT and DB_NAME fill in.
function connectionString(secret) {
  if (/^postgres(ql)?:\/\//.test(secret))
    return { url: secret, fields: ["(connection string)"] };
  let data;
  try {
    data = JSON.parse(secret);
  } catch {
    throw new Error("The secret is neither a postgres:// address nor JSON.");
  }
  const fields = Object.keys(data);
  const ready = data.DATABASE_URL ?? data.databaseUrl ?? data.url;
  if (typeof ready === "string") return { url: ready, fields, data };

  const user = data.username;
  const password = data.password;
  const host = data.host ?? process.env.DB_HOST;
  const port = data.port ?? process.env.DB_PORT ?? 5432;
  const name = data.dbname ?? data.database ?? process.env.DB_NAME;
  if (!user || !password || !host || !name) {
    throw new Error(
      `The secret needs username, password, host and dbname (or DB_HOST and DB_NAME). ` +
        `Its fields: ${fields.join(", ")}`,
    );
  }
  // Amazon RDS expects encrypted connections; DB_SSLMODE overrides it.
  const sslmode =
    process.env.DB_SSLMODE ??
    (/\.rds\.amazonaws\.com$/.test(host) ? "require" : "");
  const query = sslmode ? `?sslmode=${encodeURIComponent(sslmode)}` : "";
  const url =
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
    `@${host}:${port}/${encodeURIComponent(name)}${query}`;
  return { url, fields, data };
}

async function prepareEnvironment() {
  if (process.env.DATABASE_URL)
    return { fields: ["DATABASE_URL (already set)"] };
  const { url, fields, data } = connectionString(await readSecret());
  process.env.DATABASE_URL = url;
  for (const key of EXTRA_SECRETS) {
    if (!process.env[key] && typeof data?.[key] === "string")
      process.env[key] = data[key];
  }
  return { fields };
}

// Runs a tool from this app's node_modules with Node, the same on every system.
function binOf(packageName, binName) {
  const dir = join(process.cwd(), "node_modules", packageName);
  const { bin } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return join(dir, typeof bin === "string" ? bin : bin[binName]);
}

function runPrisma(args) {
  const result = spawnSync(
    process.execPath,
    [binOf("prisma", "prisma"), ...args],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) throw new Error(`prisma ${args.join(" ")} failed.`);
}

// Signs in to Expo with EXPO_TOKEN the way merchants' builds do, and shows who it is and
// which Expo accounts it can use (never the token).
function checkExpo() {
  if (!process.env.EXPO_TOKEN) {
    console.log("No EXPO_TOKEN in the secret: merchants' builds can't run.");
    return;
  }
  // Only what the tool needs to run and sign in, never the database login.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      [
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
        "EXPO_TOKEN",
      ].includes(key.toUpperCase()),
    ),
  );
  const result = spawnSync("eas", ["whoami"], {
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.log(
      `Expo didn't accept EXPO_TOKEN: ${(result.stderr || result.error?.message || "").trim()}`,
    );
    return;
  }
  console.log(`Expo token works. Expo says:\n${result.stdout.trim()}`);
}

async function main() {
  const check = process.argv.includes("--check");
  const { fields } = await prepareEnvironment();
  console.log(`Database login found. Secret fields: ${fields.join(", ")}`);

  if (check) {
    // Connects without changing anything, so a wrong host or password shows up here.
    runPrisma(["migrate", "status"]);
    console.log(
      "Check passed: the database login works and the database answers.",
    );
    checkExpo();
    return;
  }

  runPrisma(["generate"]);
  runPrisma(["migrate", "deploy"]);

  process.env.PORT ??= "3000";
  const server = spawn(
    process.execPath,
    [
      binOf("@react-router/serve", "react-router-serve"),
      "./build/server/index.js",
    ],
    { stdio: "inherit", env: process.env },
  );
  // Docker stops containers with SIGTERM; pass it on so requests finish cleanly.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.kill(signal));
  }
  server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

main().catch((error) => {
  // Messages never include the connection string or password.
  console.error(`Appsy didn't start: ${error.message}`);
  process.exit(1);
});
