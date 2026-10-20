import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// One customer quote in the Testimonials section.
export const testimonial = defineManifest({
  id: "testimonial",
  kind: "block",
  title: "Testimonial",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    quote: input.textarea("Quote", { max: 400 }),
    author: input.text("Customer name", { max: 60 }),
    rating: input.select(
      "Stars",
      { "0": "No stars", "3": "3 stars", "4": "4 stars", "5": "5 stars" },
      "5",
    ),
  }),
  defaults: {},
});
