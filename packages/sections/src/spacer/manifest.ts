import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Empty space between sections (docs/03, section C). The background uses the theme's
// colours, so it suits the app whatever the theme.
export const spacer = defineManifest({
  id: "spacer",
  kind: "section",
  title: "Spacer",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    height: input.range("Height (points)", { min: 8, max: 120, step: 8, default: 32 }),
    background: input.select(
      "Background",
      { none: "None", brand: "Brand colour", accent: "Accent colour" },
      "none",
    ),
    showLine: input.checkbox("Show a line in the middle", false),
  }),
  defaults: {},
});
