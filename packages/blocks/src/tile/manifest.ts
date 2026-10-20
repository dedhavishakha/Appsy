import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One picture of the Media grid section, with an optional heading over it.
export const tile = defineManifest({
  id: "tile",
  kind: "block",
  title: "Tile",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    heading: input.text("Heading", { max: 40 }),
    link: input.link("Link"),
  }),
  defaults: {},
});
