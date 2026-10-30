import { z } from "zod";
import type { AppDesign } from "./design";
import { shopifyGid } from "./fields";

// Size charts (Appsy's Functionality page). Each chart is an Appsy-owned entry in the
// store's Shopify (metaobject type `$app:size_chart`, declared in the admin's
// shopify.app.toml), so it stays the store's data: merchants see it in Shopify admin, and
// their website can show it too. Apps read and write their own entries without access
// scopes (shopify.dev changelog, 2026-04). This feature's settings say which products
// show which chart; the app always reads the chart itself fresh from Shopify.
export const SIZE_CHART_FEATURE = "size-chart";
export const SIZE_CHART_TYPE = "$app:size_chart";
// There's no size chart field on products: declaring one needs write_products, which
// Appsy doesn't ask for. A product rule gives one product its own chart.

// Most specific first: the order the app checks rules in.
export const SIZE_CHART_MATCHES = ["product", "collection", "type", "tag", "vendor"] as const;
export type SizeChartMatch = (typeof SIZE_CHART_MATCHES)[number];

const chartId = shopifyGid("Metaobject");

export const sizeChartRule = z.object({
  match: z.enum(SIZE_CHART_MATCHES),
  // A product or collection id, or a product type, tag or vendor as the store writes it.
  value: z.string().trim().min(1).max(255),
  chart: chartId,
});

export const sizeChartSettings = z.object({
  defaultChart: chartId.optional(),
  rules: z.array(sizeChartRule).max(100).default([]),
});

// A chart's table (its `table` field, JSON): column headings and rows of cells.
export const SIZE_CHART_MAX_COLUMNS = 10;
export const SIZE_CHART_MAX_ROWS = 40;
export const SIZE_CHART_MAX_CELL = 40;
const cell = z.string().max(SIZE_CHART_MAX_CELL);
export const sizeChartTable = z.object({
  columns: z.array(cell).min(1).max(SIZE_CHART_MAX_COLUMNS),
  rows: z.array(z.array(cell).max(SIZE_CHART_MAX_COLUMNS)).max(SIZE_CHART_MAX_ROWS),
});

export type SizeChartRule = z.output<typeof sizeChartRule>;
export type SizeChartSettings = z.output<typeof sizeChartSettings>;
export type SizeChartTable = z.output<typeof sizeChartTable>;

// A table read back from Shopify: an object, or JSON text of one. Null if it isn't a table.
export function readSizeChartTable(value: unknown): SizeChartTable | null {
  let data = value;
  for (let depth = 0; typeof data === "string" && depth < 2; depth += 1) {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const table = sizeChartTable.safeParse(data);
  return table.success ? table.data : null;
}

// The store's settings, kept while the feature is off so they stay the same.
export function savedSizeChartSettings(design: Pick<AppDesign, "features">): SizeChartSettings {
  const settings = sizeChartSettings.safeParse(design.features[SIZE_CHART_FEATURE]?.settings ?? {});
  return settings.success ? settings.data : { rules: [] };
}

// The settings the app uses, while the feature is on.
export function sizeChartSettingsOf(
  design: Pick<AppDesign, "features">,
): SizeChartSettings | null {
  return design.features[SIZE_CHART_FEATURE]?.enabled === true
    ? savedSizeChartSettings(design)
    : null;
}

// Changes which products use which chart, keeping the feature's switch as it is.
export function setSizeChartSettings(design: AppDesign, settings: SizeChartSettings): AppDesign {
  const enabled = design.features[SIZE_CHART_FEATURE]?.enabled === true;
  return {
    ...design,
    features: { ...design.features, [SIZE_CHART_FEATURE]: { enabled, settings } },
  };
}

// Takes a deleted chart out of the default and the rules.
export function withoutSizeChart(settings: SizeChartSettings, chart: string): SizeChartSettings {
  return {
    ...(settings.defaultChart && settings.defaultChart !== chart
      ? { defaultChart: settings.defaultChart }
      : {}),
    rules: settings.rules.filter((rule) => rule.chart !== chart),
  };
}

// What the app knows about a product when it picks its chart.
export type SizeChartProduct = {
  id: string;
  productType: string;
  vendor: string;
  tags: string[];
  collectionIds: string[];
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function matches(rule: SizeChartRule, product: SizeChartProduct): boolean {
  switch (rule.match) {
    case "product":
      return rule.value === product.id;
    case "collection":
      return product.collectionIds.includes(rule.value);
    case "type":
      return sameText(rule.value, product.productType);
    case "tag":
      return product.tags.some((tag) => sameText(tag, rule.value));
    case "vendor":
      return sameText(rule.value, product.vendor);
  }
}

// Which chart a product shows: the most specific matching rule (a product, then a
// collection, product type, tag and vendor; in list order within each), then the store's
// default. Null: this product has no size chart.
export function pickSizeChart(
  product: SizeChartProduct,
  settings: SizeChartSettings,
): string | null {
  for (const kind of SIZE_CHART_MATCHES) {
    const rule = settings.rules.find((entry) => entry.match === kind && matches(entry, product));
    if (rule) return rule.chart;
  }
  return settings.defaultChart ?? null;
}
