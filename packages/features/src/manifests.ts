import type { PackageManifest } from "@appsy/app-config";
import { appOnlyCodes } from "./app-only-codes/manifest";
import { googleAnalytics } from "./google-analytics/manifest";
import { pushNotifications } from "./push-notifications/manifest";
import { sizeChart } from "./size-chart/manifest";
import { wishlist } from "./wishlist/manifest";

export { appOnlyCodes, googleAnalytics, pushNotifications, sizeChart, wishlist };

// Every feature this release knows, for the editor's catalog (docs/04, section 3).
export const FEATURE_MANIFESTS: PackageManifest[] = [
  wishlist,
  appOnlyCodes,
  sizeChart,
  googleAnalytics,
  pushNotifications,
];
