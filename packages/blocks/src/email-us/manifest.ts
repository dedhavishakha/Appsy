import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// "Email us" in the side menu: opens a new email to the store.
export const emailUs = defineManifest({
  id: "email-us",
  kind: "block",
  title: "Email us",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    label: input.text("Label", { max: 40, default: "Email us" }),
    email: input.email("Email address"),
  }),
  defaults: {},
});
