import { defineManifest, pushSettings } from "@appsy/app-config";

// Push notifications (app-config push.ts; doc 03, section I): campaigns the merchant sends
// from Appsy through their own Firebase project, and the bag reminder each phone schedules.
// Switched on and off on Appsy's Functionality page, which also holds the reminder's
// settings and the Firebase key; campaigns have their own Push notifications page.
export const pushNotifications = defineManifest({
  id: "push-notifications",
  kind: "feature",
  title: "Push notifications",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: pushSettings,
  defaults: {},
});
