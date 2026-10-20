import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One product shown large, with a button to its page (Prestige's "Featured product").
export const featuredProduct = defineManifest({
  id: "featured-product",
  kind: "section",
  title: "Featured product",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    product: input.product("Product"),
    showDescription: input.checkbox("Show the description", true),
    buttonLabel: input.text("Button text", { max: 30, default: "View product" }),
  }),
  defaults: {},
});
