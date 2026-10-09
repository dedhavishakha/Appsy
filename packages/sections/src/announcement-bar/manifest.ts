import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A thin strip of text, such as an offer or shipping note (docs/03, section C). A link on
// the strip comes with the link input.
export const announcementBar = defineManifest({
  id: "announcement-bar",
  kind: "section",
  title: "Announcement bar",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    text: input.text("Text", { max: 120, default: "Free shipping on all orders" }),
    background: input.color("Background colour", "#1F2937"),
    textColor: input.color("Text colour", "#FFFFFF"),
    scrolling: input.checkbox("Scroll the text", false),
  }),
  defaults: {},
});
