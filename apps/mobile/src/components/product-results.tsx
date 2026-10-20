import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";
import type { ProductCardData } from "@/lib/queries";
import { activeFilterCount, emptyFilters, type ProductListing } from "@/lib/sort";
import { Button } from "./button";
import { FilterSheet } from "./filter-sheet";
import { ProductCard } from "./product-card";
import { SortSheet } from "./sort-sheet";
import { Text } from "./text";

export type ProductResultsProps = ProductListing & {
  products: ProductCardData[];
  showFilters?: boolean;
  showSorting?: boolean;
  columns?: number;
  showPrice?: boolean;
};

// Seeaash's product listing: a bar with the number of products, Filter and Sort, then the
// grid. Collection pages and search results share it. Loading more is up to the screen
// around it, which knows when the shopper nears the end.
export function ProductResults({
  products,
  filters,
  sortOptions,
  sort,
  onSortChange,
  filterState,
  onFilterChange,
  count,
  updating,
  loadingMore,
  showFilters = true,
  showSorting = true,
  columns = 2,
  showPrice = true,
}: ProductResultsProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // A new filter sheet each time it opens, so unapplied choices are dropped.
  const [filterSession, setFilterSession] = useState(0);
  const filtering = activeFilterCount(filterState);
  const canFilter = showFilters && filters.length > 0;
  const cardWidth = (Math.min(width, 600) - gutter * 2 - space.md * (columns - 1)) / columns;

  return (
    <View>
      {(canFilter || showSorting || count != null) && (
        <View style={styles.bar}>
          <Text style={[styles.count, { color: colors.text }]}>
            {count != null ? `${count} product${count === 1 ? "" : "s"}` : ""}
          </Text>
          <View style={styles.actions}>
            {canFilter && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFilterSession((session) => session + 1);
                  setFilterOpen(true);
                }}
                style={styles.action}
                hitSlop={6}
              >
                <Ionicons name="options-outline" size={16} color={colors.text} />
                <Text style={[styles.actionLabel, { color: colors.text }]}>
                  Filter{filtering ? ` (${filtering})` : ""}
                </Text>
              </Pressable>
            )}
            {showSorting && (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Change the order"
                onPress={() => setSortOpen(true)}
                style={styles.action}
                hitSlop={6}
              >
                <Ionicons name="swap-vertical" size={16} color={colors.text} />
                <Text style={[styles.actionLabel, { color: colors.text }]} numberOfLines={1}>
                  {sort.label}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {products.length === 0 ? (
        updating ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {filtering ? "No products match these filters." : "No products here yet."}
            </Text>
            {filtering ? (
              <Button title="Clear filters" variant="secondary" onPress={() => onFilterChange(emptyFilters)} />
            ) : null}
          </View>
        )
      ) : (
        <View style={[styles.grid, updating && styles.updating]}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} width={cardWidth} showPrice={showPrice} />
          ))}
        </View>
      )}
      {loadingMore && <ActivityIndicator style={styles.loading} />}

      <SortSheet
        visible={sortOpen}
        options={sortOptions}
        selected={sort}
        onSelect={onSortChange}
        onClose={() => setSortOpen(false)}
      />
      <FilterSheet
        key={filterSession}
        visible={filterOpen}
        filters={filters}
        value={filterState}
        currencyCode={products[0]?.priceRange.minVariantPrice.currencyCode}
        onApply={onFilterChange}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  count: { flexShrink: 0, fontSize: 12, opacity: 0.7 },
  actions: { flexDirection: "row", gap: space.lg, flexShrink: 1 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  actionLabel: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.xl, padding: gutter },
  updating: { opacity: 0.5 },
  loading: { marginVertical: space.xl },
  empty: { alignItems: "center", padding: space.xxl, gap: space.sm },
  emptyText: { textAlign: "center", fontSize: 14 },
});
