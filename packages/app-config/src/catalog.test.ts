import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createCatalog,
  createDefaultDesign,
  defineManifest,
  shopifyGid,
  switchFeature,
  validateDesign,
  type AppDesign,
} from "./index";

const base = { version: "1.0.0", minRuntime: "1.0.0", plans: "all" as const };

const productRow = defineManifest({
  ...base,
  id: "product-row",
  kind: "section",
  title: "Product row",
  settings: z.object({
    collection: shopifyGid("Collection"),
    heading: z.string().max(60).default(""),
    count: z.number().int().min(1).max(20).default(10),
  }),
  defaults: { collection: "gid://shopify/Collection/1" },
  acceptsBlocks: ["review-stars"],
});

const imageBanner = defineManifest({
  ...base,
  id: "image-banner",
  kind: "section",
  title: "Image banner",
  settings: z.object({ heading: z.string().default("") }),
  defaults: {},
});

const reviewStars = defineManifest({
  ...base,
  id: "review-stars",
  kind: "block",
  title: "Review stars",
  settings: z.object({}),
  defaults: {},
});

const wishlist = defineManifest({
  ...base,
  id: "wishlist",
  kind: "feature",
  title: "Wishlist",
  settings: z.object({}),
  defaults: {},
});

const productDetails = defineManifest({
  ...base,
  id: "product-details",
  kind: "section",
  title: "Product details",
  settings: z.object({}),
  defaults: {},
  pages: ["product"],
});

const catalog = createCatalog([productRow, imageBanner, productDetails, reviewStars, wishlist]);

function designWith(change: (design: AppDesign) => void): AppDesign {
  const design = createDefaultDesign({ defaultCountry: "IN" });
  // The default Product, Collection and Menu pages use packages this test catalog doesn't
  // have; packages/sections checks them against the real catalog.
  design.pages.product.sections = [];
  design.pages.collection.sections = [];
  design.pages.menu.sections = [];
  change(design);
  return design;
}

function messages(design: AppDesign): string[] {
  const result = validateDesign(design, catalog);
  return result.success ? [] : result.issues.map((issue) => issue.message);
}

describe("validateDesign", () => {
  it("accepts a valid design and fills in package defaults", () => {
    const result = validateDesign(
      designWith((design) => {
        design.pages.home.sections.push({
          id: "s1",
          type: "product-row",
          settings: { collection: "gid://shopify/Collection/7" },
          blocks: [{ id: "b1", type: "review-stars", settings: {} }],
        });
      }),
      catalog,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.design.pages.home.sections[0]?.settings).toEqual({
      collection: "gid://shopify/Collection/7",
      heading: "",
      count: 10,
    });
  });

  it("rejects section and block types it doesn't know", () => {
    const issues = messages(
      designWith((design) => {
        design.pages.home.sections.push({
          id: "s1",
          type: "video-hero",
          settings: {},
          blocks: [{ id: "b1", type: "sparkles", settings: {} }],
        });
      }),
    );
    expect(issues).toContain('Unknown section type "video-hero"');
    expect(issues).toContain('Unknown block type "sparkles"');
  });

  it("only allows the blocks a section accepts", () => {
    const issues = messages(
      designWith((design) => {
        design.pages.home.sections.push({
          id: "s1",
          type: "image-banner",
          settings: {},
          blocks: [{ id: "b1", type: "review-stars", settings: {} }],
        });
      }),
    );
    expect(issues).toContain(`"Image banner" doesn't accept "review-stars" blocks`);
  });

  it("keeps sections on the pages they're made for", () => {
    const onHome = messages(
      designWith((design) => {
        design.pages.home.sections.push({
          id: "s1",
          type: "product-details",
          settings: {},
          blocks: [],
        });
      }),
    );
    expect(onHome).toContain(`"Product details" can't go on the home page`);

    const onProduct = messages(
      designWith((design) => {
        design.pages.product.sections.push({
          id: "s1",
          type: "product-details",
          settings: {},
          blocks: [],
        });
      }),
    );
    expect(onProduct).toEqual([]);

    // Sections without a page list stay out of the side menu.
    const inMenu = messages(
      designWith((design) => {
        design.pages.menu.sections.push({
          id: "s1",
          type: "image-banner",
          settings: {},
          blocks: [],
        });
      }),
    );
    expect(inMenu).toContain(`"Image banner" can't go on the menu page`);
  });

  it("rejects an id used twice on a page", () => {
    const issues = messages(
      designWith((design) => {
        design.pages.home.sections.push(
          { id: "s1", type: "image-banner", settings: {}, blocks: [] },
          { id: "s1", type: "image-banner", settings: {}, blocks: [] },
        );
      }),
    );
    expect(issues).toContain('The id "s1" is used twice on this page');
  });

  it("points at the exact setting that's wrong", () => {
    const result = validateDesign(
      designWith((design) => {
        design.pages.home.sections.push({
          id: "s1",
          type: "product-row",
          settings: { collection: "gid://shopify/Collection/7", count: 99 },
          blocks: [],
        });
      }),
      catalog,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.path)).toContainEqual([
      "pages",
      "home",
      "sections",
      0,
      "settings",
      "count",
    ]);
  });

  it("checks tabs and header buttons", () => {
    const tooMany = messages(
      designWith((design) => {
        design.features = {};
        design.navigation.tabs = ["home", "shop", "search", "wishlist", "account", "shop"];
      }),
    );
    expect(tooMany).toContain("Choose up to 5");
    expect(tooMany).toContain("Each item can appear only once");
    expect(tooMany).toContain('"wishlist" needs the wishlist feature switched on');

    const noHome = messages(
      designWith((design) => {
        design.navigation.tabs = ["shop", "rewards"];
      }),
    );
    expect(noHome).toContain("The Home tab is required");
    expect(noHome).toContain('Unknown item "rewards"');
  });
});

describe("switchFeature", () => {
  it("takes the wishlist out of the tabs and header when it's switched off", () => {
    const design = designWith((design) => {
      design.navigation.header.right = ["search", "wishlist", "bag"];
    });
    const off = switchFeature(design, "wishlist", false);
    expect(off.features.wishlist).toEqual({ enabled: false, settings: {} });
    expect(off.navigation.tabs).toEqual(["home", "shop", "search"]);
    expect(off.navigation.header.right).toEqual(["search", "bag"]);
    expect(messages(off)).toEqual([]);
  });

  it("puts the tab back before Account", () => {
    const design = designWith((design) => {
      design.features = {};
      design.navigation.tabs = ["home", "search", "account"];
    });
    expect(switchFeature(design, "wishlist", true).navigation.tabs).toEqual([
      "home",
      "search",
      "wishlist",
      "account",
    ]);
  });
});

describe("createCatalog", () => {
  it("rejects broken manifests", () => {
    expect(() => createCatalog([reviewStars, reviewStars])).toThrow("listed twice");
    expect(() => createCatalog([{ ...imageBanner, defaults: { heading: 5 } }])).toThrow(
      "defaults don't match",
    );
    expect(() => createCatalog([productRow])).toThrow('accepts unknown block "review-stars"');
    expect(() => createCatalog([{ ...reviewStars, acceptsBlocks: ["review-stars"] }])).toThrow(
      "only sections accept blocks",
    );
    expect(() => createCatalog([{ ...reviewStars, pages: ["home"] }])).toThrow(
      "only sections are limited to pages",
    );
    expect(() =>
      createCatalog([{ ...imageBanner, defaultBlocks: ["review-stars"] }, reviewStars]),
    ).toThrow(`starts with "review-stars" blocks but doesn't accept them`);
  });

  it("checks the sample settings a new section's blocks start with", () => {
    const badge = defineManifest({
      ...base,
      id: "badge",
      kind: "block",
      title: "Badge",
      settings: z.object({ label: z.string().max(10).default("New") }),
      defaults: {},
    });
    const withBadges = (label: string) => ({
      ...imageBanner,
      acceptsBlocks: ["badge"],
      defaultBlocks: ["badge", { type: "badge", settings: { label } }],
    });
    expect(() => createCatalog([withBadges("Sale"), badge])).not.toThrow();
    expect(() => createCatalog([withBadges("Far too long for a badge"), badge])).toThrow(
      `starts with "badge" settings that don't match it`,
    );
  });
});
