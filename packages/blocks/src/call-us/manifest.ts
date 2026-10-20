import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// "Call us" in the side menu: starts a phone call to the store.
export const callUs = defineManifest({
  id: "call-us",
  kind: "block",
  title: "Call us",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    label: input.text("Label", { max: 40, default: "Call us" }),
    phone: input.phone("Phone number"),
  }),
  defaults: {},
});
