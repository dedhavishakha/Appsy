import type { Filter, FilterValue } from "./queries";

// Sort orders and filters for product lists, as in Seeaash.

// A product list's sorting, filtering and paging, from the screen that loads it.
export type ProductListing = {
  filters: Filter[];
  sortOptions: SortOption[];
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterState: FilterState;
  onFilterChange: (filters: FilterState) => void;
  // Left out while it isn't known (more pages to come and no total from Shopify).
  count?: number;
  // A new sort or filter is loading; the last results stay on screen meanwhile.
  updating: boolean;
  loadingMore: boolean;
};

export type SortOption = {
  id: string;
  label: string;
  sortKey: string;
  reverse: boolean;
};

// Shopify's sort keys for a collection's products.
export const collectionSorts: SortOption[] = [
  { id: "featured", label: "Featured", sortKey: "COLLECTION_DEFAULT", reverse: false },
  { id: "newest", label: "Newest", sortKey: "CREATED", reverse: true },
  { id: "bestselling", label: "Best selling", sortKey: "BEST_SELLING", reverse: false },
  { id: "price-asc", label: "Price: low to high", sortKey: "PRICE", reverse: false },
  { id: "price-desc", label: "Price: high to low", sortKey: "PRICE", reverse: true },
];

// Shopify's sort keys for search results.
export const searchSorts: SortOption[] = [
  { id: "relevance", label: "Relevance", sortKey: "RELEVANCE", reverse: false },
  { id: "price-asc", label: "Price: low to high", sortKey: "PRICE", reverse: false },
  { id: "price-desc", label: "Price: high to low", sortKey: "PRICE", reverse: true },
];

// The chosen filter values, kept as the `input` Shopify gave each one (as JSON text), and
// an optional price range.
export type FilterState = {
  values: string[];
  price?: { min?: number; max?: number };
};

export const emptyFilters: FilterState = { values: [] };

// Shopify sends a value's input as JSON text; keep it as text so it compares by value.
export function filterInput(value: FilterValue): string {
  return typeof value.input === "string" ? value.input : JSON.stringify(value.input);
}

// The filters argument for the Storefront API's product lists.
export function toProductFilters(state: FilterState): Record<string, unknown>[] {
  const filters = state.values.flatMap((value) => {
    try {
      return [JSON.parse(value) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  const { min, max } = state.price ?? {};
  if (min != null || max != null) filters.push({ price: { min, max } });
  return filters;
}

export function activeFilterCount(state: FilterState) {
  const { min, max } = state.price ?? {};
  return state.values.length + (min != null || max != null ? 1 : 0);
}
