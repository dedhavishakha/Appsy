import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A heading, paragraphs and an optional button (docs/03, section C). A blank line in the
// text starts a new paragraph.
export const richText = defineManifest({
  id: "rich-text",
  kind: "section",
  title: "Rich text",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    heading: input.text("Heading", { max: 80, default: "Talk about your brand" }),
    text: input.textarea("Text", {
      max: 1000,
      default: "Share information about your brand with your customers.",
    }),
    alignment: input.select("Alignment", { center: "Centre", left: "Left" }, "center"),
    buttonLabel: input.text("Button text", { max: 30 }),
    link: input.link("Button link"),
  }),
  defaults: {},
});
