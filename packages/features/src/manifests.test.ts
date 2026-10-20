import { describe, expect, it } from "vitest";
import { createCatalog, createDefaultDesign, validateDesign } from "@appsy/app-config";
import { BLOCK_MANIFESTS } from "@appsy/blocks/manifests";
import { SECTION_MANIFESTS } from "@appsy/sections/manifests";
import { FEATURE_MANIFESTS } from "./manifests";

const catalog = createCatalog([...SECTION_MANIFESTS, ...BLOCK_MANIFESTS, ...FEATURE_MANIFESTS]);

describe("feature manifests", () => {
  it("form a valid catalog with the sections and blocks", () => {
    expect(catalog.list("feature").map((manifest) => manifest.id)).toEqual(["wishlist"]);
  });

  // The whole catalog, as the editor has it: the default Product, Collection and Menu pages
  // and the wishlist feature together.
  it("let a new store's design pass the editor's check", () => {
    const result = validateDesign(createDefaultDesign({ defaultCountry: "IN" }), catalog);
    expect(result.success ? [] : result.issues).toEqual([]);
  });
});
