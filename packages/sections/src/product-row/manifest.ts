import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A horizontal row of products from one collection (docs/03, section C). The rating and
// wishlist heart join when those features exist (Phase 3).
export const productRow = defineManifest({
  id: "product-row",
  kind: "section",
  title: "Product row",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    collection: input.collection("Collection"),
    heading: input.text("Heading", { max: 60 }),
    count: input.range("Products to show", { min: 2, max: 20, default: 10 }),
    viewAll: input.checkbox("Show a “View all” button below the row", true),
    showPrice: input.checkbox("Show prices", true),
  }),
  defaults: {},
});
