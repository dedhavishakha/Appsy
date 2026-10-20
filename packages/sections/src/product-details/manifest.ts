import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The product's images and its blocks, like Shopify's "Product information" section.
// Merchants reorder, hide or add the blocks (packages/blocks).
export const productDetails = defineManifest({
  id: "product-details",
  kind: "section",
  title: "Product details",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["product"],
  acceptsBlocks: [
    "product-title",
    "product-price",
    "variant-picker",
    "buy-buttons",
    "product-description",
    "text",
    "feature-with-icon",
    "collapsible-tab",
    "separator",
  ],
  defaultBlocks: [
    "product-title",
    "product-price",
    "variant-picker",
    "buy-buttons",
    "product-description",
  ],
  settings: z.object({
    imageShape: input.select(
      "Image shape",
      { portrait: "Portrait (3:4)", square: "Square" },
      "portrait",
    ),
  }),
  defaults: {},
});
