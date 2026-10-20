import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Columns of pictures and text (Prestige's "Multi-column", also used as an Instagram-style
// grid). Each column is a "column" block.
export const multiColumn = defineManifest({
  id: "multi-column",
  kind: "section",
  title: "Multi-column",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["column"],
  defaultBlocks: [
    { type: "column", settings: { heading: "Our story", text: "Share what makes your brand special." } },
    { type: "column", settings: { heading: "Made with care", text: "Tell customers how your products are made." } },
    { type: "column", settings: { heading: "Here to help", text: "Let customers know how to reach you." } },
  ],
  settings: z.object({
    heading: input.text("Heading", { max: 60 }),
    layout: input.select(
      "Layout",
      { grid: "Two columns", scroll: "Scrolling row", stack: "One column" },
      "grid",
    ),
  }),
  defaults: {},
});
