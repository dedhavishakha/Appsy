import { z } from "zod";
import { defineManifest, input } from "@appsy/app-config";

// Side-menu rows for where the order ships and the currency prices are shown in, as
// Seeaash's "Shipping to" and "Currency". The country row shows when the store sells to more
// than one country; the currency row when the merchant turned on currency conversion.
export const countryPicker = defineManifest({
  id: "country-picker",
  kind: "block",
  title: "Country and currency",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({
    label: input.text("Country label", { max: 40, default: "Shipping to" }),
    currencyLabel: input.text("Currency label", { max: 40, default: "Currency" }),
  }),
  defaults: {},
});
