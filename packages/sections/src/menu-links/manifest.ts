import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Rows with icons under the Shopify menu, like Seeaash's: store pages, a WhatsApp chat, a
// phone call, an email, social profiles, the shopper's country and currency. Account,
// orders and wishlist rows come with those features.
export const menuLinks = defineManifest({
  id: "menu-links",
  kind: "section",
  title: "Links",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  pages: ["menu"],
  acceptsBlocks: ["menu-link", "whatsapp-chat", "call-us", "email-us", "country-picker"],
  settings: z.object({
    heading: input.text("Heading", { max: 40 }),
  }),
  defaults: {},
});
