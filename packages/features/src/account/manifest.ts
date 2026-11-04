import { accountSettings, defineManifest } from "@appsy/app-config";

// Shopper accounts (app-config accounts.ts; doc 03, section P): shoppers sign in with the
// store's Shopify customer accounts, and see their orders, addresses and profile in the
// Account tab. Switched on and off on Appsy's Functionality page, which also keeps the
// store's Customer Account API client ID. On the Advanced plan (app-config plans.ts).
export const account = defineManifest({
  id: "account",
  kind: "feature",
  title: "Shopper accounts",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: ["advanced"],
  settings: accountSettings,
  defaults: {},
});
