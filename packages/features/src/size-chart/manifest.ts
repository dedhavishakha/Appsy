import { defineManifest, sizeChartSettings } from "@appsy/app-config";

// Size charts (app-config size-charts.ts): a "Size chart" link under a product's options,
// opening the chart for that product. The charts are Appsy-owned entries in the store's
// Shopify; these settings say which products use which one. Switched on and off on Appsy's
// Functionality page, where merchants also make the charts.
export const sizeChart = defineManifest({
  id: "size-chart",
  kind: "feature",
  title: "Size charts",
  version: "1.0.0",
  minRuntime: "1.0.0",
  plans: "all",
  settings: sizeChartSettings,
  defaults: {},
});
