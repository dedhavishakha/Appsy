import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One card of the Scrolling content section: a picture with a heading and text.
export const card = defineManifest({
  id: "card",
  kind: "block",
  title: "Card",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    heading: input.text("Heading", { max: 60 }),
    text: input.textarea("Text", { max: 200 }),
    link: input.link("Link"),
  }),
  defaults: {},
});
