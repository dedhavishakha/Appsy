import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Shopify's product recommendations for the product on screen (Prestige's "Related
// products"): similar items, or ones that go with it.
export const relatedProducts = defineManifest({
  id: "related-products",
  kind: "section",
  title: "Related products",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["product"],
  settings: z.object({
    heading: input.text("Heading", { max: 60, default: "You may also like" }),
    intent: input.select(
      "Recommend",
      { related: "Similar products", complementary: "Products that go with it" },
      "related",
    ),
    count: input.range("Products to show", { min: 2, max: 10, default: 6 }),
    showPrice: input.checkbox("Show prices", true),
  }),
  defaults: {},
});
