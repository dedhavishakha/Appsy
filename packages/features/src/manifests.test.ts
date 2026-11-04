import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FEATURE,
  BAG_REMINDER_DEFAULTS,
  bagReminderOf,
  createCatalog,
  createDefaultDesign,
  designForPlan,
  setAccountClientId,
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
      "account",
    ]);
  });

  // Appsy's Functionality page saves the store's client ID, and the switch adds the Account tab.
  it("accept shopper accounts with the store's client ID, and refuse a broken one", () => {
    const design = switchFeature(
      setAccountClientId(createDefaultDesign({ defaultCountry: "IN" }), "8c0e2f6a-1b2c-4d3e"),
      ACCOUNT_FEATURE,
      true,
    );
    const result = validateDesign(design, catalog);
    expect(result.success ? [] : result.issues).toEqual([]);
    expect(design.navigation.tabs).toEqual(["home", "shop", "search", "wishlist", "account"]);

    const broken = setAccountClientId(design, "no");
    expect(validateDesign(broken, catalog).success).toBe(false);
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

  // What phones get on each plan (app-config plans.ts): locked features go, with their tabs,
  // while the design the merchant edits keeps them.
  it("leave out what a store's plan doesn't include", () => {
    const everything = switchAppCodes(
      setPushSettings(
        switchFeature(
          switchFeature(
            setAccountClientId(createDefaultDesign({ defaultCountry: "IN" }), "8c0e2f6a-1b2c-4d3e"),
            ACCOUNT_FEATURE,
            true,
          ),
          "push-notifications",
          true,
        ),
        { bagReminder: BAG_REMINDER_DEFAULTS },
      ),
      true,
      "K7Q2",
    );
    const design = {
      ...everything,
      markets: { ...everything.markets, displayCurrencyConversion: true },
    };

    const standard = designForPlan(design, "standard", catalog);
    expect(validateDesign(standard, catalog).success).toBe(true);
    expect(standard.features[ACCOUNT_FEATURE]?.enabled).toBe(false);
    expect(standard.features["app-only-codes"]).toEqual({
      enabled: false,
      settings: { start: "K7Q2" },
    });
    expect(standard.navigation.tabs).not.toContain("account");
    expect(standard.markets.displayCurrencyConversion).toBe(false);
    expect(bagReminderOf(standard)).toBeNull();
    expect(standard.features["push-notifications"]?.enabled).toBe(true);
    expect(standard.features.wishlist?.enabled).toBe(true);

    const pro = designForPlan(design, "pro", catalog);
    expect(pro.features[ACCOUNT_FEATURE]?.enabled).toBe(false);
    expect(pro.features["app-only-codes"]?.enabled).toBe(true);
    expect(pro.markets.displayCurrencyConversion).toBe(true);
    expect(bagReminderOf(pro)).toEqual(BAG_REMINDER_DEFAULTS);

    expect(designForPlan(design, "advanced", catalog)).toEqual(design);
    expect(designForPlan(design, "unlimited", catalog)).toBe(design);
    // Nothing locked is on: the design stays as it is.
    const plain = createDefaultDesign({ defaultCountry: "IN" });
    expect(designForPlan(plain, "standard", catalog)).toEqual(plain);
  });

  // The whole catalog, as the editor has it: the default Product, Collection and Menu pages
  // and the wishlist feature together.
  it("let a new store's design pass the editor's check", () => {
    const result = validateDesign(createDefaultDesign({ defaultCountry: "IN" }), catalog);
    expect(result.success ? [] : result.issues).toEqual([]);
  });
});
