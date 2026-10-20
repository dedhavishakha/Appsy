import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A sideways-scrolling row of picture cards (Prestige's "Scrolling content"). Each card is
// a "card" block.
export const scrollingContent = defineManifest({
  id: "scrolling-content",
  kind: "section",
  title: "Scrolling content",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["card"],
  defaultBlocks: [
    { type: "card", settings: { heading: "Card title", text: "Add a picture and a short description." } },
    { type: "card", settings: { heading: "Card title", text: "Add a picture and a short description." } },
    { type: "card", settings: { heading: "Card title", text: "Add a picture and a short description." } },
  ],
  settings: z.object({
    heading: input.text("Heading", { max: 60 }),
    cardSize: input.select(
      "Card size",
      { small: "Small", medium: "Medium", large: "Large" },
      "medium",
    ),
  }),
  defaults: {},
});
