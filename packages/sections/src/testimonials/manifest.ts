import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Customer quotes that swipe (Prestige's "Testimonials"). Each is a "testimonial" block.
export const testimonials = defineManifest({
  id: "testimonials",
  kind: "section",
  title: "Testimonials",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  acceptsBlocks: ["testimonial"],
  defaultBlocks: [
    { type: "testimonial", settings: { quote: "Share a review from a happy customer here.", author: "Customer name" } },
    { type: "testimonial", settings: { quote: "Add another customer review.", author: "Customer name" } },
  ],
  settings: z.object({
    heading: input.text("Heading", { max: 60, default: "What our customers say" }),
  }),
  defaults: {},
});
