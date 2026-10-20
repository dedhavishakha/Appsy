import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A picture with a heading, text and button next to it (Prestige's "Image with text").
// Phones stack them; the merchant chooses which comes first.
export const imageWithText = defineManifest({
  id: "image-with-text",
  kind: "section",
  title: "Image with text",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    heading: input.text("Heading", { max: 80, default: "Image with text" }),
    text: input.textarea("Text", {
      max: 600,
      default: "Pair text with a picture to tell a story about your products.",
    }),
    buttonLabel: input.text("Button text", { max: 30 }),
    link: input.link("Button link"),
    imageFirst: input.checkbox("Show the picture above the text", true),
  }),
  defaults: {},
});
