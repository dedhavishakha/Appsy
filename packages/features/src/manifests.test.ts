import { describe, expect, it } from "vitest";
import {
  BAG_REMINDER_DEFAULTS,
  createCatalog,
  createDefaultDesign,
  setPushSettings,
  setSizeChartSettings,
  switchAppCodes,
  switchFeature,
  validateDesign,
} from "@appsy/app-config";
import { BLOCK_MANIFESTS } from "@appsy/blocks/manifests";
import { SECTION_MANIFESTS } from "@appsy/sections/manifests";
import { FEATURE_MANIFESTS } from "./manifests";

const catalog = createCatalog([...SECTION_MANIFESTS, ...BLOCK_MANIFESTS, ...FEATURE_MANIFESTS]);

describe("feature manifests", () => {
  it("form a valid catalog with the sections and blocks", () => {
    expect(catalog.list("feature").map((manifest) => manifest.id)).toEqual([
      "wishlist",
      "app-only-codes",
      "size-chart",
      "google-analytics",
      "push-notifications",
    ]);
  });

  // Appsy's Functionality page saves the bag reminder's settings.
  it("accept push notification settings, and fill in the reminder's defaults", () => {
    const on = switchFeature(
      createDefaultDesign({ defaultCountry: "IN" }),
      "push-notifications",
      true,
    );
    const result = validateDesign(on, catalog);
    expect(result.success ? result.design.features["push-notifications"] : null).toEqual({
      enabled: true,
      settings: { bagReminder: BAG_REMINDER_DEFAULTS },
    });

    const broken = setPushSettings(on, {
      bagReminder: { ...BAG_REMINDER_DEFAULTS, hours: 0 },
    });
    expect(validateDesign(broken, catalog).success).toBe(false);
  });

  // Appsy's Functionality page saves which products use which chart.
  it("accept size chart rules, and refuse a chart that isn't a Shopify entry", () => {
    const design = setSizeChartSettings(
      switchFeature(createDefaultDesign({ defaultCountry: "IN" }), "size-chart", true),
      {
        defaultChart: "gid://shopify/Metaobject/1",
        rules: [{ match: "tag", value: "cotton", chart: "gid://shopify/Metaobject/2" }],
      },
    );
    const result = validateDesign(design, catalog);
    expect(result.success ? [] : result.issues).toEqual([]);

    const broken = setSizeChartSettings(design, {
      rules: [{ match: "tag", value: "cotton", chart: "chart-2" }],
    });
    expect(validateDesign(broken, catalog).success).toBe(false);
  });

  // Appsy's Functionality page switches it with the store's code start.
  it("accept app-only codes with a code start, and refuse a broken one", () => {
    const design = switchAppCodes(createDefaultDesign({ defaultCountry: "IN" }), true, "K7Q2");
    const result = validateDesign(design, catalog);
    expect(result.success ? [] : result.issues).toEqual([]);

    const broken = switchAppCodes(design, true, "k7q2");
    expect(validateDesign(broken, catalog).success).toBe(false);
  });

  // The whole catalog, as the editor has it: the default Product, Collection and Menu pages
  // and the wishlist feature together.
  it("let a new store's design pass the editor's check", () => {
    const result = validateDesign(createDefaultDesign({ defaultCountry: "IN" }), catalog);
    expect(result.success ? [] : result.issues).toEqual([]);
  });
});
