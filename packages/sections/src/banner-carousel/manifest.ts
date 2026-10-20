import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";
import { BANNER_HEIGHTS } from "../image-banner/manifest";

// Slides that swipe and move on by themselves (docs/03, section C). Each slide is a
// "slide" block with its own picture, heading, button and link.
export const bannerCarousel = defineManifest({
  id: "banner-carousel",
  kind: "section",
  title: "Banner carousel",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["slide"],
  defaultBlocks: ["slide", "slide"],
  settings: z.object({
    autoplay: input.range("Seconds per slide (0 turns autoplay off)", {
      min: 0,
      max: 10,
      default: 5,
    }),
    height: input.select("Height", BANNER_HEIGHTS, "adapt"),
    overlay: input.range("Darken the pictures (%)", { min: 0, max: 80, step: 10, default: 20 }),
    showDots: input.checkbox("Show slide dots", true),
  }),
  defaults: {},
});
