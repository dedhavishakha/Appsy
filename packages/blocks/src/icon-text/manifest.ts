import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";
import { ICON_LABELS } from "../icons";

// One item of the Text with icons section, such as a shipping or returns promise.
export const iconText = defineManifest({
  id: "icon-text",
  kind: "block",
  title: "Icon with text",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    icon: input.select("Icon", ICON_LABELS, "delivery"),
    heading: input.text("Heading", { max: 40 }),
    text: input.textarea("Text", { max: 200 }),
  }),
  defaults: {},
});
