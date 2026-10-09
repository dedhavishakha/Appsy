import { describe, expect, it } from "vitest";
import { createCatalog, settingsForm } from "@appsy/app-config";
import { SECTION_MANIFESTS } from "./manifests";

describe("section manifests", () => {
  it("form a valid catalog", () => {
    expect(() => createCatalog(SECTION_MANIFESTS)).not.toThrow();
  });

  it("give every setting an editor input and label", () => {
    for (const manifest of SECTION_MANIFESTS) {
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

  it("fall back to the default for a choice an older phone doesn't know", () => {
    const tiles = SECTION_MANIFESTS.find((manifest) => manifest.id === "collection-tiles");
    expect(tiles?.settings.parse({ layout: "carousel-3d" })).toMatchObject({ layout: "row" });
  });
});
