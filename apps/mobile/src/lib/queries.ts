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

// The store's own filters for a list of products, set up in Shopify's Search & Discovery
// app. Each value's `input` goes back to Shopify as it came to filter by it.
const FILTER_FIELDS = `
  id
  label
  type
  presentation
  values { id label count input swatch { color } }
`;

export type FilterValue = {
  id: string;
  label: string;
  count: number;
  input: unknown;
  swatch: { color: string | null } | null;
};

export type Filter = {
  id: string;
  label: string;
  type: string;
  presentation: string | null;
  values: FilterValue[];
};

export type PageInfo = { hasNextPage: boolean; endCursor: string | null };

// By id when a link has one (handles can be renamed), otherwise by handle. Its products
// come a page at a time, sorted and filtered.
export const COLLECTION_QUERY = `
  query AppsyCollection(
    $id: ID
    $handle: String
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
    $country: CountryCode
  ) @inContext(country: $country) {
    collection(id: $id, handle: $handle) {
      id
      title
      description
      image { url altText width height }
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
        filters { ${FILTER_FIELDS} }
        pageInfo { hasNextPage endCursor }
        nodes { ${PRODUCT_CARD_FIELDS} }
      }
    }
  }
`;

export type CollectionImage = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type CollectionData = {
  collection: {
    id: string;
    title: string;
    description: string;
    image: CollectionImage | null;
    products: { filters: Filter[]; pageInfo: PageInfo; nodes: ProductCardData[] };
  } | null;
};

// Collections for the Collection list section, with a picture to fall back on.
export const COLLECTION_LIST_QUERY = `
  query AppsyCollectionList($ids: [ID!]!, $country: CountryCode) @inContext(country: $country) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        handle
        title
        image { url altText width height }
        products(first: 1) { nodes { featuredImage { url altText width height } } }
      }
    }
  }
`;

export type CollectionListItem = {
  id: string;
  handle: string;
  title: string;
  image: CollectionImage | null;
  products: { nodes: { featuredImage: CollectionImage | null }[] };
};

export type CollectionListData = { nodes: (CollectionListItem | Record<string, never> | null)[] };

// Suggestions while the shopper types: searches, collections and products.
export const PREDICTIVE_SEARCH_QUERY = `
  query AppsyPredictiveSearch($query: String!, $country: CountryCode) @inContext(country: $country) {
    predictiveSearch(query: $query, limit: 8, types: [QUERY, COLLECTION, PRODUCT]) {
      queries { text }
      collections { id handle title }
      products { ${PRODUCT_CARD_FIELDS} }
    }
  }
`;

export type PredictiveSearchData = {
  predictiveSearch: {
    queries: { text: string }[];
    collections: { id: string; handle: string; title: string }[];
    products: ProductCardData[];
  } | null;
};

// Products matching a search, a page at a time, with the store's filters. Sold-out
// products come last.
export const SEARCH_QUERY = `
  query AppsySearch(
    $query: String!
    $first: Int!
    $after: String
    $sortKey: SearchSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
    $country: CountryCode
  ) @inContext(country: $country) {
    search(
      query: $query
      first: $first
      after: $after
      sortKey: $sortKey
      reverse: $reverse
      productFilters: $filters
      types: [PRODUCT]
      unavailableProducts: LAST
    ) {
      totalCount
      productFilters { ${FILTER_FIELDS} }
      pageInfo { hasNextPage endCursor }
      nodes { ... on Product { ${PRODUCT_CARD_FIELDS} } }
    }
  }
`;

export type SearchData = {
  search: {
    totalCount: number;
    productFilters: Filter[];
    pageInfo: PageInfo;
    nodes: (ProductCardData | Record<string, never>)[];
  };
};

// Shopify's recommendations for a product: similar ones (RELATED) or ones that go with it
// (COMPLEMENTARY).
export const RELATED_PRODUCTS_QUERY = `
  query AppsyRelatedProducts(
    $productId: ID!
    $intent: ProductRecommendationIntent
    $country: CountryCode
  ) @inContext(country: $country) {
    productRecommendations(productId: $productId, intent: $intent) {
      ${PRODUCT_CARD_FIELDS}
    }
  }
`;

export type RelatedProductsData = { productRecommendations: ProductCardData[] | null };

type ImageData = { url: string; altText: string | null };

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  price: Money;
  compareAtPrice: Money | null;
  image: ImageData | null;
};

export type ProductDetail = {
  id: string;
  handle: string;
  title: string;
  description: string;
  availableForSale: boolean;
  featuredImage: ImageData | null;
  images: { nodes: ImageData[] };
  options: { name: string; optionValues: { name: string }[] }[];
  variants: { nodes: ProductVariant[] };
  // What size chart rules match on (app-config size-charts.ts).
  productType: string;
  vendor: string;
  tags: string[];
  collections: { nodes: { id: string }[] };
};

// By id when a link has one (handles can be renamed), otherwise by handle.
export const PRODUCT_QUERY = `
  query AppsyProduct($id: ID, $handle: String, $country: CountryCode)
  @inContext(country: $country) {
    product(id: $id, handle: $handle) {
      id
      handle
      title
      description
      availableForSale
      productType
      vendor
      tags
      collections(first: 50) { nodes { id } }
      featuredImage { url altText }
      images(first: 10) { nodes { url altText } }
      options { name optionValues { name } }
      variants(first: 100) {
        nodes {
          id
          title
          availableForSale
          selectedOptions { name value }
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          image { url altText }
        }
      }
    }
  }
`;

export type ProductData = { product: ProductDetail | null };

// One size chart: an Appsy-owned entry in the store's Shopify (app-config size-charts.ts).
export const SIZE_CHART_QUERY = `
  query AppsySizeChart($id: ID!) {
    metaobject(id: $id) {
      id
      name: field(key: "name") { value }
      table: field(key: "table") { value }
      note: field(key: "note") { value }
      image: field(key: "image") {
        reference { ... on MediaImage { image { url altText width height } } }
      }
      page: field(key: "page") {
        reference { ... on Page { title onlineStoreUrl } }
      }
    }
  }
`;

export type SizeChartData = {
  metaobject: {
    id: string;
    name: { value: string } | null;
    table: { value: string } | null;
    note: { value: string } | null;
    image: {
      reference: {
        image: { url: string; altText: string | null; width: number; height: number } | null;
      } | null;
    } | null;
    page: { reference: { title: string; onlineStoreUrl: string | null } | null } | null;
  } | null;
};

export type CartLine = {
  id: string;
  quantity: number;
  // Before and after the line's own (product) discounts, and the price of one.
  cost: { subtotalAmount: Money; totalAmount: Money; amountPerQuantity: Money };
  // Every discount on the line, order-wide ones included: an automatic discount's title,
  // or the code.
  discountAllocations: CartDiscountAllocation[];
  merchandise: {
    id: string;
    title: string;
    image: ImageData | null;
    // The id and vendor go to Google Analytics (lib/analytics.ts).
    product: { id: string; handle: string; title: string; vendor: string };
  };
};

export type CartDiscountAllocation = { discountedAmount: Money; title?: string; code?: string };

export type Cart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  // Shopify's subtotal is before order-wide discounts and taxes; the total is what's due.
  cost: { subtotalAmount: Money; totalAmount: Money };
  // Codes stay on the cart; `applicable` says whether the bag qualifies right now.
  discountCodes: { code: string; applicable: boolean }[];
  lines: { nodes: CartLine[] };
};

export type CartPayload = {
  cart: Cart | null;
  userErrors: { field?: string[] | null; message: string }[];
  // Only the mutations that add discount codes ask for these: DISCOUNT_NOT_FOUND says
  // Shopify has no such code, which `applicable` alone can't tell.
  warnings?: { code: string }[];
};

const CART_FIELDS = `
  fragment AppsyCartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    discountCodes { code applicable }
    lines(first: 100) {
      nodes {
        id
        quantity
        cost {
          subtotalAmount { amount currencyCode }
          totalAmount { amount currencyCode }
          amountPerQuantity { amount currencyCode }
        }
        discountAllocations(lineLevelOnly: false) {
          discountedAmount { amount currencyCode }
          ... on CartAutomaticDiscountAllocation { title }
          ... on CartCodeDiscountAllocation { code }
          ... on CartCustomDiscountAllocation { title }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            image { url altText }
            product { id handle title vendor }
          }
        }
      }
    }
  }
`;

const CART_PAYLOAD = `cart { ...AppsyCartFields } userErrors { field message }`;
const CART_PAYLOAD_WITH_WARNINGS = `${CART_PAYLOAD} warnings { code }`;

export const CART_QUERY = `
  query AppsyCart($id: ID!, $country: CountryCode) @inContext(country: $country) {
    cart(id: $id) { ...AppsyCartFields }
  }
  ${CART_FIELDS}
`;

// `consent` is the shopper's usage-data answer, which Shopify carries into checkout
// (lib/analytics.ts visitorConsent).
export const CART_CREATE_MUTATION = `
  mutation AppsyCartCreate($input: CartInput!, $country: CountryCode, $consent: VisitorConsent)
  @inContext(country: $country, visitorConsent: $consent) {
    cartCreate(input: $input) { ${CART_PAYLOAD_WITH_WARNINGS} }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_ADD_MUTATION = `
  mutation AppsyCartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode)
  @inContext(country: $country) {
    cartLinesAdd(cartId: $cartId, lines: $lines) { ${CART_PAYLOAD} }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_UPDATE_MUTATION = `
  mutation AppsyCartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!, $country: CountryCode)
  @inContext(country: $country) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) { ${CART_PAYLOAD} }
  }
  ${CART_FIELDS}
`;

// Moves the bag to another country, so its prices, taxes and checkout follow that market.
export const CART_BUYER_IDENTITY_MUTATION = `
  mutation AppsyCartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!, $country: CountryCode)
  @inContext(country: $country) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) { ${CART_PAYLOAD} }
  }
  ${CART_FIELDS}
`;

// Replaces the cart's codes with this full list (an empty list removes them all).
export const CART_DISCOUNT_CODES_MUTATION = `
  mutation AppsyCartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!, $country: CountryCode)
  @inContext(country: $country) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      ${CART_PAYLOAD_WITH_WARNINGS}
    }
  }
  ${CART_FIELDS}
`;

export const CART_LINES_REMOVE_MUTATION = `
  mutation AppsyCartLinesRemove($cartId: ID!, $lineIds: [ID!]!, $country: CountryCode)
  @inContext(country: $country) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { ${CART_PAYLOAD} }
  }
  ${CART_FIELDS}
`;

export type MenuItemData = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  resource: { __typename: string; id?: string; handle?: string } | null;
  items?: MenuItemData[];
};

const MENU_ITEM_FIELDS = `
  fragment AppsyMenuItem on MenuItem {
    id
    title
    type
    url
    resource {
      __typename
      ... on Collection { id handle }
      ... on Product { id handle }
    }
  }
`;

// One of the store's menus by handle, three levels deep (as deep as Shopify menus go).
export const MENU_QUERY = `
  query AppsyMenu($handle: String!, $country: CountryCode) @inContext(country: $country) {
    menu(handle: $handle) {
      id
      items {
        ...AppsyMenuItem
        items { ...AppsyMenuItem items { ...AppsyMenuItem } }
      }
    }
  }
  ${MENU_ITEM_FIELDS}
`;

export type MenuData = { menu: { id: string; items: MenuItemData[] } | null };

export type ShopMenuItemData = Omit<MenuItemData, "resource" | "items"> & {
  resource:
    | ({ __typename: string; id?: string; handle?: string } & Partial<
        Pick<CollectionTileData, "image" | "products">
      >)
    | null;
  items?: ShopMenuItemData[];
};

// The Shop tab's menu, two levels deep, with each collection's picture for its tiles.
export const SHOP_MENU_QUERY = `
  query AppsyShopMenu($handle: String!, $country: CountryCode) @inContext(country: $country) {
    menu(handle: $handle) {
      id
      items {
        ...AppsyShopMenuItem
        items { ...AppsyShopMenuItem }
      }
    }
  }

  fragment AppsyShopMenuItem on MenuItem {
    id
    title
    type
    url
    resource {
      __typename
      ... on Collection {
        id
        handle
        image { url altText }
        products(first: 1) { nodes { featuredImage { url } } }
      }
      ... on Product { id handle }
    }
  }
`;

export type ShopMenuData = { menu: { id: string; items: ShopMenuItemData[] } | null };

export type WishlistProductData = ProductCardData & {
  variants: { nodes: { id: string; availableForSale: boolean }[] };
};

// Saved products as they are now: price, stock, and whether there's a single variant to add
// to the bag straight away.
export const WISHLIST_PRODUCTS_QUERY = `
  query AppsyWishlistProducts($ids: [ID!]!, $country: CountryCode)
  @inContext(country: $country) {
    nodes(ids: $ids) {
      ... on Product {
        ${PRODUCT_CARD_FIELDS}
        variants(first: 2) { nodes { id availableForSale } }
      }
    }
  }
`;

// Ids that are no longer products (deleted, or off the Appsy channel) come back as null.
export type WishlistProductsData = {
  nodes: (WishlistProductData | Record<string, never> | null)[];
};

// The countries the store sells to through Shopify Markets, each with its currency, and the
// store's default country.
export const COUNTRIES_QUERY = `
  query AppsyCountries {
    localization {
      country { isoCode }
      availableCountries { isoCode name currency { isoCode symbol } }
    }
  }
`;

export type CountryOption = { isoCode: string; name: string; currency: { isoCode: string; symbol: string } };

export type CountriesData = {
  localization: { country: { isoCode: string }; availableCountries: CountryOption[] };
};

// The store's name, and the logo in its Shopify brand settings (Storefront API `Brand`).
export const SHOP_BRAND_QUERY = `
  query AppsyShopBrand($country: CountryCode) @inContext(country: $country) {
    shop { name brand { logo { image { url width height altText } } } }
  }
`;

export type ShopBrandData = {
  shop: {
    name: string;
    brand: { logo: { image: CollectionImage | null } | null } | null;
  };
};
