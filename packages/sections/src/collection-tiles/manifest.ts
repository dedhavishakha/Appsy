import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Tappable collection tiles (docs/03, section C). Custom labels per tile come later.
export const collectionTiles = defineManifest({
  id: "collection-tiles",
  kind: "section",
  title: "Collection tiles",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    heading: input.text("Heading", { max: 60 }),
    collections: input.collectionList("Collections", { max: 12 }),
    layout: input.select("Layout", { row: "Scrolling row", grid: "Grid" }, "row"),
    shape: input.select(
      "Tile shape",
      { circle: "Circle", rounded: "Rounded square", square: "Square" },
      "circle",
    ),
  }),
  defaults: {},
});
