import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The product's name, on the Product page.
export const productTitle = defineManifest({
  id: "product-title",
  kind: "block",
  title: "Title",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    alignment: input.select("Alignment", { center: "Centre", left: "Left" }, "center"),
  }),
  defaults: {},
});
