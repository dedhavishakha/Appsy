import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The side menu's main list: one of the store's Shopify menus, as on its website. Items
// with sub-items open and close with + and − (Shopify menus nest up to three levels).
export const menuItems = defineManifest({
  id: "menu-items",
  kind: "section",
  title: "Shopify menu",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["menu"],
  settings: z.object({
    menu: input.menu("Menu"),
    capitals: input.checkbox("Show main items in capitals", true),
  }),
  defaults: {},
});
