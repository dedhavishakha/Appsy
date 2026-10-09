import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Published settings files. A git-ignored local folder in development; S3 behind
// CloudFront once Appsy is hosted (docs/01, section 6), behind these same functions.
const ROOT = resolve(".storage");

// The only paths that are ever written or served (docs/04, section 4).
const PUBLIC_KEY = /^a\/[0-9a-f-]{36}\/(live|v\/\d+)\.json$/;

export async function putPublicFile(key: string, body: string) {
  if (!PUBLIC_KEY.test(key)) throw new Error(`Refusing to store "${key}"`);
  const path = join(ROOT, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

export async function readPublicFile(key: string): Promise<string | null> {
  if (!PUBLIC_KEY.test(key)) return null;
  try {
    return await readFile(join(ROOT, key), "utf8");
  } catch {
    return null;
  }
}

// Locally the dev server serves files at /cdn (routes/cdn.$.tsx); later, the CDN's domain.
export function publicUrl(appUrl: string, key: string) {
  return `${appUrl}/cdn/${key}`;
}
