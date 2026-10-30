import { z } from "zod";
import { codeStart, defineManifest } from "@appsy/app-config";

// Discount codes that work in the app but not on the website (app-config app-codes.ts): the
// store creates them in Shopify with its code start, and shoppers type them without it.
// Switched on and off on Appsy's Functionality page, which also creates the code start.
export const appOnlyCodes = defineManifest({
  id: "app-only-codes",
  kind: "feature",
  title: "App-only discount codes",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({ start: codeStart.optional() }),
  defaults: {},
});
