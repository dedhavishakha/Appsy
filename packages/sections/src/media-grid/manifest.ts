import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A grid of pictures, each with an optional heading and link (Prestige's "Media grid").
// Each picture is a "tile" block.
export const mediaGrid = defineManifest({
  id: "media-grid",
  kind: "section",
  title: "Media grid",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["tile"],
  defaultBlocks: [
    { type: "tile", settings: { heading: "New arrivals" } },
    { type: "tile", settings: { heading: "Best sellers" } },
    { type: "tile", settings: { heading: "Gift ideas" } },
    { type: "tile", settings: { heading: "Sale" } },
  ],
  settings: z.object({
    heading: input.text("Heading", { max: 60 }),
    layout: input.select(
      "Layout",
      { mosaic: "First picture large", grid: "Equal squares" },
      "mosaic",
    ),
  }),
  defaults: {},
});
