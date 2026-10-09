import { z } from "zod";
import { countryCode, hexColor, httpsUrl, nodeId, slug } from "./fields";

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
export const PAGE_NAMES = ["home", "product", "collection"] as const;

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
      .object({ url: httpsUrl, height: z.number().int().min(16).max(64) })
      .optional(),
  }),
  navigation: z.object({
    tabs: z.array(z.string()).min(1),
    header: z.object({
      left: z.array(z.string()),
      right: z.array(z.string()),
    }),
    // Handle of the Shopify menu that the ☰ button opens, or null for no menu.
    drawerMenu: z.string().min(1).max(255).nullable(),
  }),
  features: z.record(z.string(), featureSchema).default({}),
  pages: z.object({
    home: pageSchema,
    product: pageSchema,
    collection: pageSchema,
  }),
});

export type AppDesign = z.output<typeof appDesignSchema>;
export type AppDesignInput = z.input<typeof appDesignSchema>;
export type SectionInstance = z.output<typeof sectionSchema>;
export type BlockInstance = z.output<typeof blockSchema>;
export type FeatureEntry = z.output<typeof featureSchema>;

// A new merchant's starting design, using the Seeaash defaults (doc 03). Theme presets
// replace it in Phase 3.
export function createDefaultDesign(shop: {
  defaultCountry: string;
  drawerMenu: string | null;
}): AppDesign {
  return appDesignSchema.parse({
    markets: { defaultCountry: shop.defaultCountry },
    theme: {
      preset: "classic",
      colors: {
        brand: "#42523D",
        background: "#FFFFFF",
        text: "#1F2937",
        accent: "#C2410C",
      },
      fonts: { heading: "Jost", body: "Montserrat" },
      buttons: { shape: "rounded", style: "filled" },
    },
    navigation: {
      // The Wishlist and Account tabs arrive with those features (Phase 3).
      tabs: ["home", "shop", "search"],
      header: {
        left: shop.drawerMenu ? ["menu"] : [],
        right: ["search", "currency", "bag"],
      },
      drawerMenu: shop.drawerMenu,
    },
    pages: { home: {}, product: {}, collection: {} },
  });
}
