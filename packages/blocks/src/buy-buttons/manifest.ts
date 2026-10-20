import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The Add to bag button. Checkout is always Shopify's (App Store rule 5.7.14).
export const buyButtons = defineManifest({
  id: "buy-buttons",
  kind: "block",
  title: "Buy button",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    label: input.text("Button text", { max: 30, default: "Add to bag" }),
  }),
  defaults: {},
});

