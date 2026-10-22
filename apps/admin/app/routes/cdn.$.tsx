import type { LoaderFunctionArgs } from "react-router";
import { readPublicFile } from "../models/storage.server";
import { ROBOTS } from "../robots";

// Serves published files, standing in for CloudFront: design files, and the identity file
// with the icon and splash pictures that builds download. They're public by design: phone
// apps and Expo's build servers download them without signing in.
const TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  png: "image/png",
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const key = params["*"] ?? "";
  const body = await readPublicFile(key);
  if (body === null) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[key.slice(key.lastIndexOf(".") + 1)] ?? TYPES.json,
      // live.json and identity.json change on every publish or save; version files and
      // pictures (named by their content) never change (docs/04, section 4).
      "Cache-Control": /\/(live|identity)\.json$/.test(key)
        ? "public, max-age=60"
        : "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": ROBOTS,
    },
  });
};
