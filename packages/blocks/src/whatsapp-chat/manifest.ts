import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// "Chat with us" in the side menu: opens a WhatsApp chat with the store's number.
export const whatsappChat = defineManifest({
  id: "whatsapp-chat",
  kind: "block",
  title: "WhatsApp chat",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    label: input.text("Label", { max: 40, default: "Chat with us" }),
    phone: input.phone("WhatsApp number"),
    message: input.textarea("Message the chat starts with", { max: 300 }),
  }),
  defaults: {},
});
