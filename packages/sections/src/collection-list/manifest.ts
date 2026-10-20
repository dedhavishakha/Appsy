import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Collections as pictures that open them, like Prestige's "Collection list". Each one is a
// "collection" block; the pictures keep their own shape, or are all 4:5 or 1:1.
export const collectionList = defineManifest({
  id: "collection-list",
  kind: "section",
  title: "Collection list",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["collection"],
  defaultBlocks: ["collection", "collection"],
  settings: z.object({
    heading: input.text("Heading", { max: 60 }),
    ratio: input.select(
      "Picture shape",
      { adapt: "Fit the picture", portrait: "Portrait (4:5)", square: "Square (1:1)" },
      "portrait",
    ),
    layout: input.select(
      "Layout",
      { grid: "Two per row", scroll: "Scrolling row", stack: "One per row" },
      "grid",
    ),
    names: input.select(
      "Collection names",
      { below: "Below the picture", overlay: "On the picture", hidden: "Hidden" },
      "below",
    ),
  }),
  defaults: {},
});
