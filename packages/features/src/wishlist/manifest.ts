import { z } from "zod";
import { defineManifest } from "@appsy/app-config";

// Shoppers save products with a heart and find them in the Wishlist tab (docs/03, section G).
// Switched on and off on Appsy's Functionality page. Guests' lists stay on the phone; signed-in
// shoppers' lists are kept in Shopify on the customer, once sign-in exists (Phase 3).
export const wishlist = defineManifest({
  id: "wishlist",
  kind: "feature",
  title: "Wishlist",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({}),
  defaults: {},
});
