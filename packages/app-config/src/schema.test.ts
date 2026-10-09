import { describe, expect, it } from "vitest";
import {
  buildPublishedSettings,
  createDefaultDesign,
  migrateDesign,
  publishedSettingsSchema,
} from "./index";

// The example file from doc 04, section 2.
const docExample = {
  schemaVersion: 1,
  version: 12,
  publishedAt: "2026-10-08T10:00:00Z",
  minRuntime: "1.0.0",
  shop: {
    domain: "example.myshopify.com",
    storefrontUrl: "https://example.com",
    storefrontToken: "public-storefront-token",
    apiVersion: "2026-07",
  },
  markets: { defaultCountry: "US", displayCurrencyConversion: false },
  theme: {
    preset: "classic",
    colors: { brand: "#42523D", background: "#FFFFFF", text: "#1F2937", accent: "#C2410C" },
    fonts: { heading: "Jost", body: "Montserrat" },
    buttons: { shape: "rounded", style: "filled" },
    logo: { url: "https://cdn.example.com/a/app-1/img/3f2a.png", height: 28 },
  },
  navigation: {
    tabs: ["home", "shop", "search", "wishlist", "account"],
    header: { left: ["menu"], right: ["search", "currency", "bag"] },
    drawerMenu: "main-menu",
  },
  features: {
    wishlist: { enabled: true },
    push: {
      enabled: true,
      settings: { consent: { title: "Stay in the loop", body: "Get offers and order updates." } },
    },
  },
  pages: {
    home: {
      sections: [
        { id: "s1", type: "banner-carousel", settings: { slides: [], autoplaySeconds: 5 } },
        {
          id: "s2",
          type: "product-row",
          settings: { collection: "gid://shopify/Collection/1", heading: "New Arrivals" },
        },
      ],
    },
    product: {
      sections: [
        {
          id: "p1",
          type: "product-details",
          settings: { gallery: "swipe" },
          blocks: [{ id: "b1", type: "review-stars", settings: {} }],
        },
      ],
    },
    collection: { sections: [] },
  },
  links: {
    privacyPolicy: "https://example.com/policies/privacy-policy",
    accountDeletion: "https://api.example.com/d/app-1",
  },
};

describe("published settings file", () => {
  it("accepts the example from doc 04", () => {
    expect(publishedSettingsSchema.safeParse(docExample).success).toBe(true);
  });

  it("lets older phones read files from newer Appsy versions", () => {
    const newer = {
      ...docExample,
      futureKey: { anything: true },
      theme: { ...docExample.theme, buttons: { shape: "blob", style: "glass" } },
      navigation: { ...docExample.navigation, tabs: ["home", "rewards"] },
      pages: {
        ...docExample.pages,
        home: { sections: [{ id: "s9", type: "video-hero", settings: { src: "x" } }] },
      },
    };
    const result = publishedSettingsSchema.safeParse(newer);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("futureKey");
    expect(result.data.theme.buttons).toEqual({ shape: "rounded", style: "filled" });
    expect(result.data.navigation.tabs).toEqual(["home", "rewards"]);
    expect(result.data.pages.home.sections[0]?.type).toBe("video-hero");
  });

  it("rejects files that need a newer schema", () => {
    expect(publishedSettingsSchema.safeParse({ ...docExample, schemaVersion: 2 }).success).toBe(
      false,
    );
  });

  it("rejects insecure addresses and malformed values", () => {
    const badFiles = [
      { ...docExample, shop: { ...docExample.shop, storefrontUrl: "http://example.com" } },
      { ...docExample, shop: { ...docExample.shop, apiVersion: "2026-05" } },
      { ...docExample, shop: { ...docExample.shop, domain: "example.com" } },
      {
        ...docExample,
        theme: { ...docExample.theme, colors: { ...docExample.theme.colors, brand: "green" } },
      },
      { ...docExample, markets: { ...docExample.markets, defaultCountry: "usa" } },
    ];
    for (const file of badFiles) {
      expect(publishedSettingsSchema.safeParse(file).success).toBe(false);
    }
  });
});

describe("createDefaultDesign", () => {
  it("adds the ☰ button only when the shop has a menu", () => {
    const withMenu = createDefaultDesign({ defaultCountry: "IN", drawerMenu: "main-menu" });
    expect(withMenu.navigation.header.left).toEqual(["menu"]);
    expect(withMenu.navigation.tabs).toEqual(["home", "shop", "search"]);

    const withoutMenu = createDefaultDesign({ defaultCountry: "IN", drawerMenu: null });
    expect(withoutMenu.navigation.header.left).toEqual([]);
  });
});

describe("buildPublishedSettings", () => {
  it("leaves hidden sections and blocks out of the published file", () => {
    const design = createDefaultDesign({ defaultCountry: "IN", drawerMenu: "main-menu" });
    design.pages.home.sections = [
      {
        id: "a",
        type: "product-row",
        settings: {},
        blocks: [
          { id: "b1", type: "review-stars", settings: {} },
          { id: "b2", type: "review-stars", settings: {}, hidden: true },
        ],
      },
      { id: "c", type: "image-banner", settings: {}, blocks: [], hidden: true },
    ];

    const file = buildPublishedSettings({
      design,
      version: 3,
      publishedAt: new Date("2026-10-09T08:00:00Z"),
      shop: docExample.shop,
      links: docExample.links,
    });

    expect(file.schemaVersion).toBe(1);
    expect(file.minRuntime).toBe("1.0.0");
    expect(file.publishedAt).toBe("2026-10-09T08:00:00.000Z");
    expect(file.pages.home.sections).toEqual([
      {
        id: "a",
        type: "product-row",
        settings: {},
        blocks: [{ id: "b1", type: "review-stars", settings: {} }],
      },
    ]);
  });
});

describe("migrateDesign", () => {
  it("returns current-version designs unchanged", () => {
    const design = createDefaultDesign({ defaultCountry: "US", drawerMenu: null });
    expect(migrateDesign(design, 1)).toBe(design);
  });

  it("refuses versions it doesn't know", () => {
    expect(() => migrateDesign({}, 0)).toThrow();
    expect(() => migrateDesign({}, 2)).toThrow();
  });
});
