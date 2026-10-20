import { describe, expect, it } from "vitest";
import {
  appDesignSchema,
  buildPublishedSettings,
  createDefaultDesign,
  FONT_OPTIONS,
  migrateDesign,
  publishedSettingsSchema,
  THEME_PRESETS,
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
    channelHandle: "appsy-mobile-app-example",
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
    menu: {
      sections: [{ id: "m1", type: "menu-items", settings: { menu: "main-menu" } }],
    },
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

  it("reads files published before the Menu page", () => {
    const { menu: _menu, ...pages } = docExample.pages;
    const older = {
      ...docExample,
      navigation: { ...docExample.navigation, drawerMenu: "main-menu" },
      pages,
    };
    const result = publishedSettingsSchema.safeParse(older);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pages.menu).toEqual({ sections: [] });
    expect(result.data.navigation).not.toHaveProperty("drawerMenu");
  });

  it("carries the app's name and the logo's Shopify picture, and reads files without them", () => {
    expect(publishedSettingsSchema.parse(docExample).app).toBeUndefined();
    const named = {
      ...docExample,
      app: { name: "Seeaash" },
      theme: {
        ...docExample.theme,
        logo: {
          url: "https://cdn.shopify.com/s/files/1/logo.png",
          height: 28,
          id: "gid://shopify/MediaImage/1",
          aspectRatio: 3.2,
        },
      },
    };
    const result = publishedSettingsSchema.safeParse(named);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.app).toEqual({ name: "Seeaash" });
    expect(result.data.theme.logo?.aspectRatio).toBe(3.2);
    const longName = { ...named, app: { name: "x".repeat(31) } };
    expect(publishedSettingsSchema.safeParse(longName).success).toBe(false);
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
  it("starts with the ☰ button and a side menu waiting for its Shopify menu", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    expect(design.navigation.header.left).toEqual(["menu"]);
    expect(design.navigation.tabs).toEqual(["home", "shop", "search", "wishlist"]);
    expect(design.features.wishlist?.enabled).toBe(true);
    expect(design.pages.menu.sections.map((section) => section.type)).toEqual(["menu-items"]);
  });

  it("starts with the Classic preset", () => {
    const { theme } = createDefaultDesign({ defaultCountry: "IN" });
    const [classic] = THEME_PRESETS;
    expect(theme.preset).toBe("classic");
    expect(theme).toMatchObject({
      colors: classic.colors,
      fonts: classic.fonts,
      buttons: classic.buttons,
    });
  });
});

describe("THEME_PRESETS", () => {
  it("are valid themes with their own ids and fonts merchants can pick", () => {
    const themeSchema = appDesignSchema.shape.theme;
    const ids = THEME_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { id, colors, fonts, buttons } of THEME_PRESETS) {
      expect(themeSchema.safeParse({ preset: id, colors, fonts, buttons }).success).toBe(true);
      expect(Object.keys(FONT_OPTIONS)).toContain(fonts.heading);
      expect(Object.keys(FONT_OPTIONS)).toContain(fonts.body);
    }
  });
});

describe("buildPublishedSettings", () => {
  it("leaves hidden sections and blocks out of the published file", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
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
      app: { name: "Seeaash" },
    });

    expect(file.schemaVersion).toBe(1);
    expect(file.app).toEqual({ name: "Seeaash" });
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
    const design = createDefaultDesign({ defaultCountry: "US" });
    expect(migrateDesign(design, 1)).toBe(design);
  });

  it("refuses versions it doesn't know", () => {
    expect(() => migrateDesign({}, 0)).toThrow();
    expect(() => migrateDesign({}, 2)).toThrow();
  });
});
