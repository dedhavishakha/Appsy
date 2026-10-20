import { z } from "zod";
import { countryCode, hexColor, httpsUrl, nodeId, shopifyGid, slug } from "./fields";
import { THEME_PRESETS } from "./theme";

// What a merchant designs in the editor. The published settings file (published.ts) is
// this design plus the details Appsy adds at publish time.
//
// Phones on older runtimes must keep working with newer files, so these changes need no
// SCHEMA_VERSION bump: new optional keys (older phones drop them), new values for the
// `.catch` enums (older phones fall back), and new tab, header, section, block or feature
// ids (older phones skip ids they don't know). Removing, renaming or retyping a key does.

export const KNOWN_TABS = ["home", "shop", "search", "wishlist", "account"] as const;
export const KNOWN_HEADER_ITEMS = [
  "menu",
  "search",
  "currency",
  "bag",
  "wishlist",
  "account",
] as const;
// "menu" is the side drawer that the ☰ button opens: its sections are what it lists.
export const PAGE_NAMES = ["home", "product", "collection", "menu"] as const;

export type Tab = (typeof KNOWN_TABS)[number];
export type HeaderItem = (typeof KNOWN_HEADER_ITEMS)[number];
export type PageName = (typeof PAGE_NAMES)[number];

// Each package checks its own settings with its manifest (manifest.ts, validate.ts).
const packageSettings = z.record(z.string(), z.unknown()).default({});

const blockSchema = z.object({
  id: nodeId,
  type: z.string().min(1),
  settings: packageSettings,
  hidden: z.boolean().optional(),
});

const sectionSchema = z.object({
  id: nodeId,
  type: z.string().min(1),
  settings: packageSettings,
  blocks: z.array(blockSchema).default([]),
  hidden: z.boolean().optional(),
});

const pageSchema = z.object({
  sections: z.array(sectionSchema).default([]),
});

const featureSchema = z.object({
  enabled: z.boolean(),
  settings: packageSettings,
});

const fontName = z.string().min(1).max(64);

export const appDesignSchema = z.object({
  markets: z.object({
    defaultCountry: countryCode,
    // Currency conversion (Appsy's Settings page): shoppers pick any currency and prices are
    // converted for display with daily exchange rates; checkout charges the market's currency.
    displayCurrencyConversion: z.boolean().default(false),
  }),
  theme: z.object({
    preset: slug,
    colors: z.object({
      brand: hexColor,
      background: hexColor,
      text: hexColor,
      accent: hexColor,
    }),
    fonts: z.object({ heading: fontName, body: fontName }),
    buttons: z.object({
      shape: z.enum(["square", "rounded", "pill"]).catch("rounded"),
      style: z.enum(["filled", "outline"]).catch("filled"),
    }),
    logo: z
      .object({
        url: httpsUrl,
        // How tall the logo shows in the header, in points.
        height: z.number().int().min(16).max(64),
        // The picture in Shopify Files, and its width over height, so it's sized right.
        id: shopifyGid("MediaImage").optional(),
        aspectRatio: z.number().positive().max(20).optional(),
      })
      .optional(),
  }),
  navigation: z.object({
    tabs: z.array(z.string()).min(1),
    // The ☰ button ("menu") opens the side menu, which always ends with Privacy choices.
    header: z.object({
      left: z.array(z.string()),
      right: z.array(z.string()),
    }),
  }),
  features: z.record(z.string(), featureSchema).default({}),
  pages: z.object({
    home: pageSchema,
    product: pageSchema,
    collection: pageSchema,
    // Designs saved before the Menu page existed have none.
    menu: pageSchema.default({ sections: [] }),
  }),
});

export type AppDesign = z.output<typeof appDesignSchema>;
export type AppDesignInput = z.input<typeof appDesignSchema>;
export type SectionInstance = z.output<typeof sectionSchema>;
export type BlockInstance = z.output<typeof blockSchema>;
export type FeatureEntry = z.output<typeof featureSchema>;

// The Product, Collection and Menu pages every design starts with, like Shopify's "Product
// information". Phones also use the Product and Collection ones for designs published
// before templates existed. Settings fill in from each package's defaults.
export function defaultPageSections(
  page: "product" | "collection" | "menu",
): SectionInstance[] {
  if (page === "collection") {
    return [{ id: "product-grid", type: "product-grid", settings: {}, blocks: [] }];
  }
  // The merchant picks which Shopify menu it lists.
  if (page === "menu") {
    return [{ id: "menu-items", type: "menu-items", settings: {}, blocks: [] }];
  }
  const blocks = [
    "product-title",
    "product-price",
    "variant-picker",
    "buy-buttons",
    "product-description",
  ];
  return [
    {
      id: "product-details",
      type: "product-details",
      settings: {},
      blocks: blocks.map((type) => ({ id: type, type, settings: {} })),
    },
  ];
}

// A new merchant's starting design: the Classic preset, Seeaash's look (doc 03).
export function createDefaultDesign(shop: { defaultCountry: string }): AppDesign {
  const classic = THEME_PRESETS[0];
  return appDesignSchema.parse({
    markets: { defaultCountry: shop.defaultCountry },
    theme: {
      preset: classic.id,
      colors: classic.colors,
      fonts: classic.fonts,
      buttons: classic.buttons,
    },
    navigation: {
      // The Account tab arrives with shopper sign-in (Phase 3).
      tabs: ["home", "shop", "search", "wishlist"],
      header: {
        left: ["menu"],
        right: ["search", "currency", "bag"],
      },
    },
    // On for new stores (your decision, 2026-10-16); Appsy's Settings page switches it.
    features: { wishlist: { enabled: true, settings: {} } },
    pages: {
      home: {},
      product: { sections: defaultPageSections("product") },
      collection: { sections: defaultPageSections("collection") },
      menu: { sections: defaultPageSections("menu") },
    },
  });
}
