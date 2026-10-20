import type { ImageValue } from "@appsy/app-config";

// What routes/api.images.tsx answers about a picture from Shopify Files.
export type ImageResult = { image: ImageValue } | { error: string };
