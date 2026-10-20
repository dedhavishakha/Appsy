import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The price of the chosen option, in the shopper's market currency.
export const productPrice = defineManifest({
  id: "product-price",
  kind: "block",
  title: "Price",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    showCompareAt: input.checkbox("Show the price before a sale, crossed out", true),
  }),
  defaults: {},
});
