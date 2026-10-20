import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Free text on the Product page, such as a care note or a promise.
export const text = defineManifest({
  id: "text",
  kind: "block",
  title: "Text",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    text: input.textarea("Text", { max: 1000 }),
    size: input.select("Size", { small: "Small", regular: "Regular", large: "Large" }, "regular"),
  }),
  defaults: {},
});
