import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A collection's products in a grid (docs/03, section C), on the Collection page. Filters
// are the store's own, set up in Shopify's Search & Discovery app.
export const productGrid = defineManifest({
  id: "product-grid",
  kind: "section",
  title: "Product grid",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["collection"],
  settings: z.object({
    columns: input.select("Columns", { "2": "2", "3": "3" }, "2"),
    showPrice: input.checkbox("Show prices", true),
    filters: input.checkbox("Show filters", true),
    sorting: input.checkbox("Show sorting", true),
  }),
  defaults: {},
});
