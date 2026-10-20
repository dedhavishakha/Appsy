import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// The banner's height: the picture's own shape, or a fixed share of the phone's width.
export const BANNER_HEIGHTS = {
  adapt: "Fit the picture",
  small: "Small",
  medium: "Medium",
  large: "Large",
} as const;

// One picture with an optional heading and button; a tap opens its link (docs/03,
// section C). The picture lives in the store's Shopify Files.
export const imageBanner = defineManifest({
  id: "image-banner",
  kind: "section",
  title: "Image banner",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    image: input.image("Picture"),
    link: input.link("Link"),
    heading: input.text("Heading", { max: 60 }),
    buttonLabel: input.text("Button text", { max: 30 }),
    overlay: input.range("Darken the picture (%)", { min: 0, max: 80, step: 10, default: 20 }),
    height: input.select("Height", BANNER_HEIGHTS, "adapt"),
  }),
  defaults: {},
});
