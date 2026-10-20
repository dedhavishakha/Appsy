import { z } from "zod";
import { defineManifest } from "@appsy/app-config";

// A thin line between Product page blocks.
export const separator = defineManifest({
  id: "separator",
  kind: "block",
  title: "Separator",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({}),
  defaults: {},
});
