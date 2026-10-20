import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// A coupon card: a discount code made in Shopify's Discounts page, with a button that adds
// it to the shopper's bag. Shopify applies the discount; Appsy only shows the code. Shopify
// asks apps to promote only discounts every buyer can use
// (https://shopify.dev/docs/apps/build/discounts/rollouts).
export const offer = defineManifest({
  id: "offer",
  kind: "section",
  title: "Offer",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    heading: input.text("Heading", { max: 60, default: "Special offer" }),
    text: input.textarea("Text", { max: 200, default: "Add this code to your bag to save." }),
    code: input.text("Discount code", {
      max: 100,
      info: "Create it in Shopify's Discounts page. Only promote a code every shopper can use.",
    }),
    style: input.select(
      "Style",
      { outline: "Outline", filled: "Filled with your brand colour" },
      "outline",
    ),
  }),
  defaults: {},
});
