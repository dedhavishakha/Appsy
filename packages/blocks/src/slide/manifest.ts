import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One slide of the Banner carousel: a picture, an optional heading and button, and where a
// tap goes.
export const slide = defineManifest({
  id: "slide",
  kind: "block",
  title: "Slide",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    link: input.link("Link"),
    heading: input.text("Heading", { max: 60 }),
    buttonLabel: input.text("Button text", { max: 30 }),
  }),
  defaults: {},
});
