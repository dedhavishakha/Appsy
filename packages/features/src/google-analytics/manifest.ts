import { z } from "zod";
import { defineManifest } from "@appsy/app-config";

// Google Analytics 4 (app-config ga4.ts; doc 03, section J2): the merchant's own GA4 gets
// the app's shopping events through Firebase, after the shopper allows usage data. The
// switch is on Appsy's Functionality page, with the merchant's google-services.json, which
// their app's next build includes. Off, the app sends nothing to Google even if the build
// has the file.
export const googleAnalytics = defineManifest({
  id: "google-analytics",
  kind: "feature",
  title: "Google Analytics",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: z.object({}),
  defaults: {},
});
