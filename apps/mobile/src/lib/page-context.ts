import { createContext } from "react";
import { defaultPageSections, type PublishedSettings, type SectionInstance } from "@appsy/app-config";
import type { CollectionImage, ProductCardData, ProductDetail } from "./queries";
import type { ProductListing } from "./sort";

export type CollectionPage = {
  title: string;
  description: string;
  image: CollectionImage | null;
  products: ProductCardData[];
  // The product grid's sorting, filtering and paging, loaded by the collection screen.
  listing: ProductListing;
};

// The product or collection a page shows, shared with the sections on that page.
export const ProductContext = createContext<ProductDetail | null>(null);
export const CollectionContext = createContext<CollectionPage | null>(null);

// A page's sections from the design. Designs published before Product and Collection
// templates existed get the default templates.
export function pageSections(
  settings: PublishedSettings,
  page: "home" | "product" | "collection",
): SectionInstance[] {
  const sections = settings.pages[page].sections;
  if (page === "home" || sections.length > 0) return sections;
  return defaultPageSections(page);
}

// For a ScrollView's onScroll: whether the shopper is near the end, so the next page of
// products can load before they get there.
export function nearEnd(event: {
  nativeEvent: {
    layoutMeasurement: { height: number };
    contentOffset: { y: number };
    contentSize: { height: number };
  };
}) {
  const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - 800;
}
