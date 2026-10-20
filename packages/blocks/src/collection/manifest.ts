import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One collection in the Collection list section, shown with a picture from Shopify Files or
// the collection's own picture.
export const collection = defineManifest({
  id: "collection",
  kind: "block",
  title: "Collection",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    collection: input.collection("Collection"),
    image: input.image("Picture (instead of the collection's own)"),
    title: input.text("Name shown (instead of the collection's)", { max: 40 }),
  }),
  defaults: {},
});
