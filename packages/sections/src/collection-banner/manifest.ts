import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The collection's own picture, title and description at the top of the Collection page
// (Prestige's "Collection banner"), all read from Shopify.
export const collectionBanner = defineManifest({
  id: "collection-banner",
  kind: "section",
  title: "Collection banner",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["collection"],
  settings: z.object({
    showImage: input.checkbox("Show the collection's picture", true),
    showDescription: input.checkbox("Show the collection's description", true),
    height: input.select("Height", { small: "Small", medium: "Medium", large: "Large" }, "medium"),
    overlay: input.range("Darken the picture (%)", { min: 0, max: 80, step: 10, default: 30 }),
  }),
  defaults: {},
});
