import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Buttons for the product's options, such as size and colour.
export const variantPicker = defineManifest({
  id: "variant-picker",
  kind: "block",
  title: "Options",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    showOptionNames: input.checkbox("Show option names, such as “Size”", true),
  }),
  defaults: {},
});
