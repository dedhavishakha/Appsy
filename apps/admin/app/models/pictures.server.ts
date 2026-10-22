import { createHash } from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ImageValue } from "@appsy/app-config";
import { FileError, waitForImage } from "./files.server";

// Turning pictures from the store's Shopify Files into the exact files apps need
// (models/identity.server.ts): reading them again from Shopify, downloading them, and
// naming the rendered files by their content.

// Pictures larger than this aren't downloaded.
const MAX_DOWNLOAD = 25 * 1024 * 1024;

// A problem with one of the merchant's pictures, shown beside the field it came from.
export class PictureError<Field extends string = string> extends Error {
  constructor(
    readonly field: Field,
    message: string,
  ) {
    super(message);
  }
}

// The picture as Shopify gives it now, so only the store's own files are ever downloaded,
// at the address Shopify gives.
export async function shopifyPicture<Field extends string>(
  admin: AdminApiContext,
  image: ImageValue,
  field: Field,
): Promise<ImageValue> {
  try {
    return await waitForImage(admin, image.id);
  } catch (error) {
    if (error instanceof FileError)
      throw new PictureError(field, error.message);
    throw error;
  }
}

export async function downloadPicture<Field extends string>(
  image: ImageValue,
  field: Field,
) {
  const response = await fetch(image.url, {
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) {
    throw new PictureError(
      field,
      "Shopify didn't give Appsy the picture. Please try again.",
    );
  }
  const tooLarge = new PictureError(
    field,
    "This picture is too large. Choose one under 25 MB.",
  );
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD)
    throw tooLarge;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_DOWNLOAD) throw tooLarge;
  return body;
}

// Pictures sharp can't read (an unusual format, a damaged file) become a message.
export async function readPicture<Field extends string>(
  field: Field,
  work: () => Promise<Buffer>,
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PictureError) throw error;
    console.error("Reading a picture:", error);
    throw new PictureError(
      field,
      "Appsy couldn't read this picture. Choose a PNG or JPG file.",
    );
  }
}

export type Picture = { name: string; png: Buffer };

// Named by content, so a changed picture gets a new address and caches never serve the
// old one (routes/cdn.$.tsx).
export function named(role: string, png: Buffer): Picture {
  const hash = createHash("sha256").update(png).digest("hex").slice(0, 12);
  return { name: `${role}-${hash}.png`, png };
}
