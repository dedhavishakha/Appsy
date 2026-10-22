import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, sep } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { PREVIEW_ROOT as ROOT } from "../models/preview.server";
import { ROBOTS } from "../robots";

// The editor's phone preview (routes/editor.tsx): the phone app's web build, made by
// apps/mobile/scripts/build-preview.mjs. Public like any website: it holds no store data
// until the editor sends it a design.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const requested = normalize(join(ROOT, params["*"] ?? ""));
  if (requested !== ROOT && !requested.startsWith(ROOT + sep))
    return notFound();

  // Paths without a file type are the app's own pages, which its single index.html draws.
  const type = TYPES[extname(requested).toLowerCase()];
  const file = type ? requested : join(ROOT, "index.html");
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    return notFound();
  }

  // Bundles and assets have content hashes in their names; the page changes with each build.
  const hashed = /^(_expo|assets)[\\/]/.test(relative(ROOT, file));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type ?? TYPES[".html"],
      "Cache-Control": hashed
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Robots-Tag": ROBOTS,
    },
  });
};

function notFound() {
  return new Response("Not found", { status: 404 });
}
