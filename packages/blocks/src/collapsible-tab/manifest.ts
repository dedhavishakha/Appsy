import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A heading that opens to show more, like Prestige's "More information" product tabs.
export const collapsibleTab = defineManifest({
  id: "collapsible-tab",
  kind: "block",
  title: "Collapsible tab",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    heading: input.text("Heading", { max: 60, default: "More information" }),
    content: input.textarea("Content", { max: 2000 }),
    open: input.checkbox("Open at first", false),
  }),
  defaults: {},
});
