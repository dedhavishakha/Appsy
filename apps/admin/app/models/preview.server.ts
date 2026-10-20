import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Where apps/mobile/scripts/build-preview.mjs puts the phone app's web build, which
// routes/preview.$.tsx serves to the editor's phone frame. Git-ignored; built by the
// admin's `npm run dev` when it's missing or older than the app's code, and by
// `npm run preview:build`.
export const PREVIEW_ROOT = resolve(".preview");

export function previewBuilt() {
  return existsSync(join(PREVIEW_ROOT, "index.html"));
}
