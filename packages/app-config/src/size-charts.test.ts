import { describe, expect, it } from "vitest";
import {
  createDefaultDesign,
  pickSizeChart,
  readSizeChartTable,
  savedSizeChartSettings,
  setSizeChartSettings,
  SIZE_CHART_FEATURE,
  sizeChartSettingsOf,
  switchFeature,
  withoutSizeChart,
  type SizeChartProduct,
  type SizeChartSettings,
} from "./index";

const chart = (id: number) => `gid://shopify/Metaobject/${id}`;

const shirt: SizeChartProduct = {
  id: "gid://shopify/Product/1",
  productType: "Shirt",
  vendor: "Noodle Co",
  tags: ["Cotton", "summer"],
  collectionIds: ["gid://shopify/Collection/7"],
};

const settings: SizeChartSettings = {
  defaultChart: chart(1),
  rules: [
    { match: "vendor", value: "noodle co", chart: chart(6) },
    { match: "tag", value: "cotton", chart: chart(5) },
    { match: "type", value: "shirt", chart: chart(4) },
    { match: "collection", value: "gid://shopify/Collection/7", chart: chart(3) },
    { match: "product", value: "gid://shopify/Product/1", chart: chart(2) },
  ],
};

describe("which size chart a product shows", () => {
  it("uses the most specific rule: product, collection, type, tag, vendor", () => {
    expect(pickSizeChart(shirt, settings)).toBe(chart(2));
    const rest = (kinds: string[]) => ({
      ...settings,
      rules: settings.rules.filter((rule) => kinds.includes(rule.match)),
    });
    expect(pickSizeChart(shirt, rest(["collection", "type", "tag", "vendor"]))).toBe(chart(3));
    expect(pickSizeChart(shirt, rest(["type", "tag", "vendor"]))).toBe(chart(4));
    expect(pickSizeChart(shirt, rest(["tag", "vendor"]))).toBe(chart(5));
    expect(pickSizeChart(shirt, rest(["vendor"]))).toBe(chart(6));
  });

  it("matches types, tags and vendors in any case", () => {
    const tagged = { rules: [{ match: "tag" as const, value: "SUMMER", chart: chart(5) }] };
    expect(pickSizeChart(shirt, tagged)).toBe(chart(5));
  });

  it("falls back to the default, then to none", () => {
    const plain: SizeChartProduct = {
      id: "gid://shopify/Product/2",
      productType: "Cap",
      vendor: "",
      tags: [],
      collectionIds: [],
    };
    expect(pickSizeChart(plain, settings)).toBe(chart(1));
    expect(pickSizeChart(plain, { rules: [] })).toBeNull();
  });
});

describe("size chart settings", () => {
  it("are used only while the feature is on, and kept while it's off", () => {
    const design = setSizeChartSettings(createDefaultDesign({ defaultCountry: "IN" }), settings);
    expect(sizeChartSettingsOf(design)).toBeNull();
    expect(savedSizeChartSettings(design).defaultChart).toBe(chart(1));

    const on = switchFeature(design, SIZE_CHART_FEATURE, true);
    expect(sizeChartSettingsOf(on)?.rules).toHaveLength(5);
    expect(sizeChartSettingsOf(setSizeChartSettings(on, { rules: [] }))?.rules).toEqual([]);
  });

  it("forget a deleted chart", () => {
    const left = withoutSizeChart(settings, chart(1));
    expect(left.defaultChart).toBeUndefined();
    expect(withoutSizeChart(settings, chart(3)).rules.map((rule) => rule.chart)).not.toContain(
      chart(3),
    );
  });
});

describe("size chart tables", () => {
  const table = { columns: ["Size", "Chest"], rows: [["S", "36"], ["M", "38"]] };

  it("read back as an object or as JSON text", () => {
    expect(readSizeChartTable(table)).toEqual(table);
    expect(readSizeChartTable(JSON.stringify(table))).toEqual(table);
    expect(readSizeChartTable(JSON.stringify(JSON.stringify(table)))).toEqual(table);
  });

  it("refuse anything else", () => {
    expect(readSizeChartTable("not json")).toBeNull();
    expect(readSizeChartTable({ columns: [], rows: [] })).toBeNull();
    expect(readSizeChartTable(null)).toBeNull();
  });
});
