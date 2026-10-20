import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ImageValue } from "@appsy/app-config";

// Pictures come only from the store's own Shopify Files: the merchant chooses one with
// Shopify's file picker, and this reads its address and size.

// A problem the merchant can fix, shown to them as it is.
export class FileError extends Error {}

const FILE_STATUS_QUERY = `#graphql
  query AppsyFileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        fileStatus
        fileErrors {
          message
        }
        image {
          url
          width
          height
          altText
        }
      }
    }
  }`;

type FileStatus = {
  fileStatus?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  fileErrors?: { message: string }[];
  image?: {
    url: string;
    width: number | null;
    height: number | null;
    altText: string | null;
  } | null;
};

const WAIT_STEPS = 30;
const WAIT_MS = 1000;

// A picture from Shopify Files once it's ready. One just added in Shopify may still be
// processing, so this waits up to half a minute.
export async function waitForImage(
  admin: AdminApiContext,
  id: string,
): Promise<ImageValue> {
  for (let step = 0; step < WAIT_STEPS; step += 1) {
    if (step > 0) await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    const response = await admin.graphql(FILE_STATUS_QUERY, {
      variables: { id },
    });
    const { data } = (await response.json()) as {
      data: { node: FileStatus | null };
    };
    const node = data.node;
    if (!node) continue;
    if (!node.fileStatus)
      throw new FileError("Choose a picture, not another kind of file.");
    if (node.fileStatus === "FAILED") {
      throw new FileError(
        node.fileErrors?.[0]?.message ??
          "Shopify couldn't process this picture.",
      );
    }
    if (node.fileStatus === "READY" && node.image) {
      return {
        id,
        url: node.image.url,
        // Only the shape matters; Shopify gives both once the file is ready.
        width: node.image.width ?? 1600,
        height: node.image.height ?? 900,
        alt: node.image.altText ?? "",
      };
    }
  }
  throw new FileError(
    "Shopify is still processing the picture. Try again in a minute.",
  );
}
