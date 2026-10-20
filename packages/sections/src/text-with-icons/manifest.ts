import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Short promises with icons, such as shipping and returns (Prestige's "Text with icons").
// Each is an "icon-text" block.
export const textWithIcons = defineManifest({
  id: "text-with-icons",
  kind: "section",
  title: "Text with icons",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["icon-text"],
  defaultBlocks: [
    { type: "icon-text", settings: { icon: "delivery", heading: "Shipping", text: "Describe your delivery options." } },
    { type: "icon-text", settings: { icon: "returns", heading: "Returns", text: "Explain your returns policy." } },
    { type: "icon-text", settings: { icon: "secure", heading: "Secure checkout", text: "Checkout is handled securely by Shopify." } },
  ],
  settings: z.object({
    layout: input.select(
      "Layout",
      { row: "Scrolling row", grid: "Two columns", stack: "One column" },
      "stack",
    ),
  }),
  defaults: {},
});
