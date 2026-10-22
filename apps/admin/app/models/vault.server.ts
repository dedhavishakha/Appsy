import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AppleTeamType } from "./store-accounts";

// The vault for merchants' store keys: their App Store Connect API key and Google service
// account. Keys live only here; the database keeps the secret's ARN (doc 05, section 6).
//
// On the server (AWS_REGION set): one AWS Secrets Manager secret per merchant app, named
// appsy/merchants/<app id>, encrypted by Secrets Manager with AWS KMS and written and read
// with the EC2 server's IAM role, so no AWS credentials are in the code or env files.
// On a developer's computer, with no AWS role: an AES-256-GCM encrypted file per app in
// the git-ignored .vault folder.

export type GoogleServiceAccount = {
  type: "service_account";
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
  [field: string]: unknown;
};

export type StoreKeys = {
  apple?: {
    issuerId: string;
    keyId: string;
    teamId: string;
    teamType: AppleTeamType;
    privateKey: string;
  };
  google?: { serviceAccount: GoogleServiceAccount };
};

const APP_ID = /^[0-9a-f-]{36}$/;
const useAws = Boolean(process.env.AWS_REGION);

function check(appProjectId: string) {
  if (!APP_ID.test(appProjectId))
    throw new Error(`Bad app id "${appProjectId}"`);
  if (!useAws && process.env.NODE_ENV === "production") {
    throw new Error("The key vault needs AWS_REGION on the server.");
  }
}

const secretName = (appProjectId: string) => `appsy/merchants/${appProjectId}`;

async function secretsManager() {
  const sdk = await import("@aws-sdk/client-secrets-manager");
  return {
    sdk,
    client: new sdk.SecretsManagerClient({ region: process.env.AWS_REGION }),
  };
}

// Saves the app's keys (replacing what was there) and returns where they are.
export async function putStoreKeys(appProjectId: string, keys: StoreKeys) {
  check(appProjectId);
  const body = JSON.stringify(keys);
  if (!useAws) {
    await writeLocal(appProjectId, body);
    return `local:${appProjectId}`;
  }
  const { sdk, client } = await secretsManager();
  try {
    const created = await client.send(
      new sdk.CreateSecretCommand({
        Name: secretName(appProjectId),
        Description: "Appsy: one merchant app's App Store and Google Play keys",
        SecretString: body,
      }),
    );
    return created.ARN ?? secretName(appProjectId);
  } catch (error) {
    if (!(error instanceof sdk.ResourceExistsException)) throw error;
    const updated = await client.send(
      new sdk.PutSecretValueCommand({
        SecretId: secretName(appProjectId),
        SecretString: body,
      }),
    );
    return updated.ARN ?? secretName(appProjectId);
  }
}

export async function getStoreKeys(
  appProjectId: string,
): Promise<StoreKeys | null> {
  check(appProjectId);
  if (!useAws) return readLocal(appProjectId);
  const { sdk, client } = await secretsManager();
  try {
    const { SecretString } = await client.send(
      new sdk.GetSecretValueCommand({ SecretId: secretName(appProjectId) }),
    );
    return SecretString ? (JSON.parse(SecretString) as StoreKeys) : null;
  } catch (error) {
    if (error instanceof sdk.ResourceNotFoundException) return null;
    throw error;
  }
}

// Deleted at once, without Secrets Manager's recovery window: on disconnect, and when the
// store's data is erased (shop/redact).
export async function deleteStoreKeys(appProjectId: string) {
  check(appProjectId);
  if (!useAws) {
    await rm(localFile(appProjectId), { force: true });
    return;
  }
  const { sdk, client } = await secretsManager();
  try {
    await client.send(
      new sdk.DeleteSecretCommand({
        SecretId: secretName(appProjectId),
        ForceDeleteWithoutRecovery: true,
      }),
    );
  } catch (error) {
    if (!(error instanceof sdk.ResourceNotFoundException)) throw error;
  }
}

// Development only: files encrypted with a key from APPSY_VAULT_KEY (32 bytes, base64), or
// one made on first use in .vault/dev.key.
const LOCAL_ROOT = resolve(".vault");
const localFile = (appProjectId: string) =>
  join(LOCAL_ROOT, `${appProjectId}.json`);

async function localKey() {
  if (process.env.APPSY_VAULT_KEY)
    return Buffer.from(process.env.APPSY_VAULT_KEY, "base64");
  const file = join(LOCAL_ROOT, "dev.key");
  try {
    return Buffer.from((await readFile(file, "utf8")).trim(), "base64");
  } catch {
    const key = randomBytes(32);
    await mkdir(LOCAL_ROOT, { recursive: true });
    await writeFile(file, key.toString("base64"), { mode: 0o600 });
    return key;
  }
}

async function writeLocal(appProjectId: string, body: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await localKey(), iv);
  const data = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  await mkdir(LOCAL_ROOT, { recursive: true });
  await writeFile(
    localFile(appProjectId),
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
    { mode: 0o600 },
  );
}

async function readLocal(appProjectId: string): Promise<StoreKeys | null> {
  let stored: { iv: string; tag: string; data: string };
  try {
    stored = JSON.parse(await readFile(localFile(appProjectId), "utf8"));
  } catch {
    return null;
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await localKey(),
    Buffer.from(stored.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const body = Buffer.concat([
    decipher.update(Buffer.from(stored.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(body) as StoreKeys;
}
