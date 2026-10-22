import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Published files. A git-ignored local folder in development; S3 behind CloudFront once
// Appsy is hosted (docs/01, section 6), behind these same functions.
const ROOT = resolve(".storage");

// The only paths that are ever written or served (docs/04, section 4): a design's live
// pointer and versions, and the app's identity file with its icon and splash pictures,
// whose names carry a hash of their content (models/identity.server.ts).
const PUBLIC_KEY =
  /^a\/[0-9a-f-]{36}\/((live|v\/\d+|identity)\.json|identity\/[a-z-]+-[0-9a-f]{12}\.png)$/;

const APP_FOLDER = /^[0-9a-f-]{36}$/;

export async function putPublicFile(key: string, body: string | Uint8Array) {
  if (!PUBLIC_KEY.test(key)) throw new Error(`Refusing to store "${key}"`);
  const path = join(ROOT, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function readPublicFile(key: string): Promise<Buffer | null> {
  if (!PUBLIC_KEY.test(key)) return null;
  try {
    return await readFile(join(ROOT, key));
  } catch {
    return null;
  }
}

// Everything published for one merchant app, when the store's data is erased.
export async function deletePublicFiles(appProjectId: string) {
  if (!APP_FOLDER.test(appProjectId)) {
    throw new Error(`Refusing to delete "${appProjectId}"`);
  }
  await rm(join(ROOT, "a", appProjectId), { recursive: true, force: true });
}

// Locally the dev server serves files at /cdn (routes/cdn.$.tsx); later, the CDN's domain.
export function publicUrl(appUrl: string, key: string) {
  return `${appUrl}/cdn/${key}`;
}
