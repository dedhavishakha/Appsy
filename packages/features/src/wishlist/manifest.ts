import { z } from "zod";
import { defineManifest } from "@appsy/app-config";

// Shoppers save products with a heart and find them in the Wishlist tab (docs/03, section G).
// Switched on and off on Appsy's Functionality page. Each list stays on the phone, signed in
// or not (decided 2026-11-02).
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
