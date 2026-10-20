import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Time left until a sale or launch, as a block or a slim bar (Prestige's "Countdown" and
// its condensed top bar). It hides itself once the time is up (docs/03, section C).
export const countdown = defineManifest({
  id: "countdown",
  kind: "section",
  title: "Countdown",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    endsAt: input.datetime("Ends on"),
    style: input.select("Style", { block: "Block", bar: "Slim bar" }, "block"),
    heading: input.text("Heading", { max: 60, default: "Sale ends in" }),
    text: input.textarea("Text", { max: 200 }),
    buttonLabel: input.text("Button text", { max: 30 }),
    link: input.link("Link"),
    background: input.color("Background colour", "#1F2937"),
    textColor: input.color("Text colour", "#FFFFFF"),
  }),
  defaults: {},
});
