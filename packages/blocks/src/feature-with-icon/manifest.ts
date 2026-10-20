import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";
import { ICON_LABELS } from "../icons";

// A short promise with an icon on the Product page, such as "Free delivery".
export const featureWithIcon = defineManifest({
  id: "feature-with-icon",
  kind: "block",
  title: "Feature with icon",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    icon: input.select("Icon", ICON_LABELS, "delivery"),
    text: input.text("Text", { max: 80 }),
  }),
  defaults: {},
});
