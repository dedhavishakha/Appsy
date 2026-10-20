import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One column of the Multi-column section: a picture, a heading and text, and a link.
export const column = defineManifest({
  id: "column",
  kind: "block",
  title: "Column",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    heading: input.text("Heading", { max: 60 }),
    text: input.textarea("Text", { max: 300 }),
    link: input.link("Link"),
  }),
  defaults: {},
});
