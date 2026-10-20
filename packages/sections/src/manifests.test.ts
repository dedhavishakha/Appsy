import { describe, expect, it } from "vitest";
import { createCatalog, settingsForm } from "@appsy/app-config";
import { BLOCK_MANIFESTS } from "@appsy/blocks/manifests";
import { SECTION_MANIFESTS } from "./manifests";

const ALL_MANIFESTS = [...SECTION_MANIFESTS, ...BLOCK_MANIFESTS];

describe("section manifests", () => {
  it("form a valid catalog with the blocks", () => {
    expect(() => createCatalog(ALL_MANIFESTS)).not.toThrow();
  });

  it("give every setting an editor input and label", () => {
    for (const manifest of ALL_MANIFESTS) {
      for (const [key, field] of Object.entries(settingsForm(manifest.settings).properties)) {
        expect(field.input, `${manifest.id}.${key}`).toBeDefined();
        expect(field.title, `${manifest.id}.${key}`).toBeTruthy();
      }
    }
  });

  it("fill in every default when a section is added", () => {
    const productRow = SECTION_MANIFESTS.find((manifest) => manifest.id === "product-row");
    expect(productRow?.settings.parse(productRow.defaults)).toEqual({
      collection: null,
      heading: "",
      count: 10,
      viewAll: true,
      showPrice: true,
    });
  });

  it("start a new banner without a picture or link", () => {
    const banner = SECTION_MANIFESTS.find((manifest) => manifest.id === "image-banner");
    expect(banner?.settings.parse(banner.defaults)).toEqual({
      image: null,
      link: null,
      heading: "",
      buttonLabel: "",
      overlay: 20,
      height: "adapt",
    });
  });

  it("fall back to the default for a choice an older phone doesn't know", () => {
    const tiles = SECTION_MANIFESTS.find((manifest) => manifest.id === "collection-tiles");
    expect(tiles?.settings.parse({ layout: "carousel-3d" })).toMatchObject({ layout: "row" });
  });

  it("keep the side menu's sections in the menu, and other sections out of it", () => {
    const menuOnly = SECTION_MANIFESTS.filter((manifest) => manifest.pages?.includes("menu"));
    expect(menuOnly.map((manifest) => manifest.id)).toEqual(["menu-items", "menu-links"]);
    for (const manifest of menuOnly) expect(manifest.pages).toEqual(["menu"]);
  });

  it("offer a country and currency row in the side menu", () => {
    const links = SECTION_MANIFESTS.find((manifest) => manifest.id === "menu-links");
    expect(links?.acceptsBlocks).toContain("country-picker");
    const row = BLOCK_MANIFESTS.find((manifest) => manifest.id === "country-picker");
    expect(row?.settings.parse(row.defaults)).toEqual({ label: "Shipping to", currencyLabel: "Currency" });
  });

  it("check phone numbers and email addresses in the menu's contact rows", () => {
    const whatsapp = BLOCK_MANIFESTS.find((manifest) => manifest.id === "whatsapp-chat");
    expect(whatsapp?.settings.safeParse({ phone: "+91 98765 43210" }).success).toBe(true);
    expect(whatsapp?.settings.safeParse({ phone: "" }).success).toBe(true);
    expect(whatsapp?.settings.safeParse({ phone: "call me" }).success).toBe(false);

    const email = BLOCK_MANIFESTS.find((manifest) => manifest.id === "email-us");
    expect(email?.settings.safeParse({ email: "help@example.com" }).success).toBe(true);
    expect(email?.settings.safeParse({ email: "" }).success).toBe(true);
    expect(email?.settings.safeParse({ email: "help" }).success).toBe(false);
  });

  it("start a collection list with two collections to choose, in portrait pictures", () => {
    const list = SECTION_MANIFESTS.find((manifest) => manifest.id === "collection-list");
    expect(list?.settings.parse(list.defaults)).toEqual({
      heading: "",
      ratio: "portrait",
      layout: "grid",
      names: "below",
    });
    expect(list?.defaultBlocks).toEqual(["collection", "collection"]);
    const block = BLOCK_MANIFESTS.find((manifest) => manifest.id === "collection");
    expect(block?.settings.parse(block.defaults)).toEqual({ collection: null, image: null, title: "" });
  });

  it("start an offer without a code, and tell the merchant where codes come from", () => {
    const card = SECTION_MANIFESTS.find((manifest) => manifest.id === "offer");
    expect(card?.settings.parse(card.defaults)).toEqual({
      heading: "Special offer",
      text: "Add this code to your bag to save.",
      code: "",
      style: "outline",
    });
    const form = card ? settingsForm(card.settings) : null;
    expect(form?.properties.code?.info).toContain("Discounts page");
  });

  it("show filters and sorting on product grids, including ones saved before they existed", () => {
    const grid = SECTION_MANIFESTS.find((manifest) => manifest.id === "product-grid");
    expect(grid?.settings.parse({ columns: "3", showPrice: false })).toEqual({
      columns: "3",
      showPrice: false,
      filters: true,
      sorting: true,
    });
  });
});
