import { useAppBridge } from "@shopify/app-bridge-react";
import type { ImageValue } from "@appsy/app-config";
import type { ImageResult } from "../models/image-result";

// Shopify's own file picker (Intents API), limited to pictures, then the picture's address
// and size from routes/api.images.tsx. Pictures come only from the store's Shopify Files.
export function usePickImage() {
  const shopify = useAppBridge();

  return async (current?: string): Promise<ImageValue | null> => {
    if (!shopify.intents?.invoke) {
      throw new Error(
        "Shopify's file picker isn't available here. Reload Appsy and try again.",
      );
    }
    const activity = await shopify.intents.invoke("pick:shopify/File", {
      data: {
        mediaTypes: ["MediaImage"],
        multiSelect: false,
        selectedFiles: current ? [current] : [],
      },
    });
    const response = await activity.complete;
    if (response?.code !== "ok") return null;
    const ids = response.data?.ids;
    const id = Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
    if (!id) return null;
    return readImage(await fetch(`/api/images?id=${encodeURIComponent(id)}`));
  };
}

// The status code in the fallback message helps when the answer isn't Appsy's own.
async function readImage(response: Response): Promise<ImageValue> {
  const result = (await response.json().catch(() => null)) as Partial<
    ImageResult & { image: ImageValue; error: string }
  > | null;
  if (result?.image) return result.image;
  throw new Error(
    result?.error ??
      `Appsy couldn't get the picture (error ${response.status}). Please try again.`,
  );
}
