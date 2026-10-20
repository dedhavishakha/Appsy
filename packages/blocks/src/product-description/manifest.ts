import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The product description from Shopify.
export const productDescription = defineManifest({
  id: "product-description",
  kind: "block",
  title: "Description",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    heading: input.text("Heading", { max: 40 }),
  }),
  defaults: {},
});
