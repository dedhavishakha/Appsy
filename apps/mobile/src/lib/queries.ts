import type { Money } from "./format";

// Storefront API 2026-07 queries, validated with Shopify's Storefront schema.

export type ProductCardData = {
  id: string;
  handle: string;
  title: string;
  availableForSale: boolean;
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  compareAtPriceRange: { minVariantPrice: Money };
};

export type CollectionTileData = {
  id: string;
  handle: string;
  title: string;
  image: { url: string; altText: string | null } | null;
  products: { nodes: { featuredImage: { url: string } | null }[] };
};

const PRODUCT_CARD_FIELDS = `
  id
  handle
  title
  availableForSale
  featuredImage { url altText }
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
`;

export const PRODUCT_ROW_QUERY = `
  query AppsyProductRow($id: ID!, $first: Int!, $country: CountryCode)
  @inContext(country: $country) {
    collection(id: $id) {
      handle
      title
      products(first: $first) { nodes { ${PRODUCT_CARD_FIELDS} } }
    }
  }
`;

export type ProductRowData = {
  collection: { handle: string; title: string; products: { nodes: ProductCardData[] } } | null;
};

export const COLLECTION_TILES_QUERY = `
  query AppsyCollectionTiles($ids: [ID!]!, $country: CountryCode)
  @inContext(country: $country) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        handle
        title
        image { url altText }
        products(first: 1) { nodes { featuredImage { url } } }
      }
    }
  }
`;

export type CollectionTilesData = { nodes: (CollectionTileData | Record<string, never> | null)[] };

export const COLLECTION_QUERY = `
  query AppsyCollection($handle: String!, $first: Int!, $country: CountryCode)
  @inContext(country: $country) {
    collection(handle: $handle) {
      title
      products(first: $first) { nodes { ${PRODUCT_CARD_FIELDS} } }
    }
  }
`;

export type CollectionData = {
  collection: { title: string; products: { nodes: ProductCardData[] } } | null;
};
