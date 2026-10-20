import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";
import { LINK_ICON_LABELS } from "../icons";

// A row in the side menu's Links section: a store page such as "Visit our store", a booking
// page, or a social profile such as Instagram.
export const menuLink = defineManifest({
  id: "menu-link",
  kind: "block",
  title: "Link",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    icon: input.select("Icon", LINK_ICON_LABELS, "link"),
    label: input.text("Label", { max: 40 }),
    link: input.link("Link"),
  }),
  defaults: {},
});
