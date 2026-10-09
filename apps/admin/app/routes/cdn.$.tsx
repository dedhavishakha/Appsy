import type { LoaderFunctionArgs } from "react-router";
import { readPublicFile } from "../models/storage.server";

// Serves published settings files in local development, standing in for CloudFront.
// They're public by design: phone apps download them without signing in.
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const key = params["*"] ?? "";
  const body = await readPublicFile(key);
  if (body === null) return new Response("Not found", { status: 404 });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // live.json changes on every publish; version files never change (docs/04, section 4).
      "Cache-Control": key.endsWith("/live.json")
        ? "public, max-age=60"
        : "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
