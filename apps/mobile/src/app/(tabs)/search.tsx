import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BagButton } from "@/components/bag-button";
import { ProductResults } from "@/components/product-results";
import { Text, TextInput } from "@/components/text";
import { useAnalytics } from "@/lib/analytics";
import { gutter, space, useColors, useSettings } from "@/lib/app-settings";
import { useMoney } from "@/lib/currency";
import { imageUrl } from "@/lib/format";
import { BORDER, PRESSED } from "@/lib/menu-drawer";
import { nearEnd } from "@/lib/page-context";
import {
  PREDICTIVE_SEARCH_QUERY,
  SEARCH_QUERY,
  type PredictiveSearchData,
  type ProductCardData,
  type SearchData,
} from "@/lib/queries";
import { useRecentSearches } from "@/lib/recent-searches";
import { emptyFilters, searchSorts, toProductFilters, type FilterState } from "@/lib/sort";
import { useStorefront, useStorefrontPages } from "@/lib/storefront";

const PAGE_SIZE = 24;

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Seeaash's search: suggestions while the shopper types (searches, collections and
// products), then all matching products with the store's filters and sort orders. Recent
// searches stay on the phone. As a tab it waits for a tap on the search box; opened from the
// header's search button without a Search tab, it has a back arrow and the keyboard ready.
export default function SearchScreen() {
  const colors = useColors();
  const isTab = useSettings().navigation.tabs.includes("search");
  const { track } = useAnalytics();
  const money = useMoney();
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [sort, setSort] = useState(searchSorts[0]);
  const [filterState, setFilterState] = useState<FilterState>(emptyFilters);
  const recent = useRecentSearches();
  const term = useDebounced(text.trim());
  const typing = text.trim() !== submitted;

  const predictive = useStorefront<PredictiveSearchData>(
    ["predictive-search", term],
    PREDICTIVE_SEARCH_QUERY,
    { query: term },
    typing && term.length >= 2,
  );
  const results = useStorefrontPages<SearchData>(
    ["search", submitted, sort.id, filterState],
    SEARCH_QUERY,
    {
      query: submitted,
      first: PAGE_SIZE,
      sortKey: sort.sortKey,
      reverse: sort.reverse,
      filters: toProductFilters(filterState),
    },
    (page) => (page.search.pageInfo.hasNextPage ? page.search.pageInfo.endCursor : null),
    submitted !== "",
  );
  const pages = results.data?.pages ?? [];
  const products = pages.flatMap((page) =>
    page.search.nodes.filter((node): node is ProductCardData => "handle" in node),
  );

  const submit = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setText(query);
    setSubmitted(query);
    setFilterState(emptyFilters);
    recent.add(query);
    // Only that a search happened: never what was typed.
    track("search", {});
    Keyboard.dismiss();
  };

  const clear = () => {
    setText("");
    setSubmitted("");
    input.current?.focus();
  };

  const loadMore = () => {
    if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
  };

  const suggestions = predictive.data?.predictiveSearch;
  const rowStyle = ({ pressed }: { pressed: boolean }) => [styles.row, pressed && styles.pressed];

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.bar, isTab && styles.tabBar]}>
        {!isTab && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        )}
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.text} style={styles.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit(text)}
            placeholder="Search products"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus={!isTab}
            accessibilityLabel="Search products"
            style={[styles.input, { color: colors.text }]}
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={clear} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.text} style={styles.muted} />
            </Pressable>
          ) : null}
        </View>
        <BagButton />
      </View>

      {submitted && !typing ? (
        results.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => nearEnd(event) && loadMore()}
            scrollEventThrottle={200}
            contentContainerStyle={styles.results}
          >
            <ProductResults
              products={products}
              filters={pages[0]?.search.productFilters ?? []}
              sortOptions={searchSorts}
              sort={sort}
              onSortChange={setSort}
              filterState={filterState}
              onFilterChange={setFilterState}
              count={pages[0]?.search.totalCount}
              updating={results.isPlaceholderData}
              loadingMore={results.isFetchingNextPage}
            />
          </ScrollView>
        )
      ) : text.trim().length >= 2 ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
          {suggestions?.queries.map((query) => (
            <Pressable key={query.text} accessibilityRole="button" onPress={() => submit(query.text)} style={rowStyle}>
              <Ionicons name="search-outline" size={16} color={colors.text} style={styles.muted} />
              <Text style={[styles.rowText, { color: colors.text }]}>{query.text}</Text>
            </Pressable>
          ))}
          {suggestions?.collections.map((collection) => (
            <Pressable
              key={collection.id}
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  pathname: "/collections/[handle]",
                  params: { handle: collection.handle, id: collection.id },
                })
              }
              style={rowStyle}
            >
              <Ionicons name="albums-outline" size={16} color={colors.text} style={styles.muted} />
              <Text style={[styles.rowText, { color: colors.text }]}>{collection.title}</Text>
              <Text style={[styles.kind, { color: colors.text }]}>Collection</Text>
            </Pressable>
          ))}
          {suggestions?.products.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="link"
              onPress={() => router.push(`/products/${product.handle}`)}
              style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}
            >
              <Image
                source={imageUrl(product.featuredImage?.url, 120)}
                alt={product.featuredImage?.altText ?? product.title}
                contentFit="cover"
                style={styles.thumb}
              />
              <View style={styles.rowText}>
                <Text style={[styles.productTitle, { color: colors.text }]} numberOfLines={2}>
                  {product.title}
                </Text>
                <Text style={[styles.price, { color: colors.text }]}>
                  {money.format(product.priceRange.minVariantPrice)}
                </Text>
              </View>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => submit(text)} style={rowStyle}>
            <Text style={[styles.seeAll, { color: colors.text }]}>See all results for “{text.trim()}”</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
          {recent.recent.length > 0 ? (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: colors.text }]}>Recent searches</Text>
                <Pressable accessibilityRole="button" onPress={recent.clear} hitSlop={8}>
                  <Text style={[styles.clear, { color: colors.text }]}>Clear</Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recent.recent.map((query) => (
                  <Pressable
                    key={query}
                    accessibilityRole="button"
                    onPress={() => submit(query)}
                    style={[styles.chip, { borderColor: BORDER }]}
                  >
                    <Ionicons name="time-outline" size={13} color={colors.text} style={styles.muted} />
                    <Text style={[styles.chipText, { color: colors.text }]}>{query}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.text }]}>Search for products and collections.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  // Without the back arrow, the search box lines up with the page's edge.
  tabBar: { paddingLeft: gutter },
  back: { padding: space.xs },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: PRESSED,
    paddingHorizontal: space.md,
    height: 42,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  muted: { opacity: 0.6 },
  loading: { marginTop: space.xxl },
  results: { paddingBottom: space.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  pressed: { backgroundColor: PRESSED },
  rowText: { flex: 1, gap: 2, fontSize: 14 },
  kind: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", opacity: 0.6 },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.sm,
  },
  thumb: { width: 48, height: 64, backgroundColor: "#F5F3EF" },
  productTitle: { fontSize: 13 },
  price: { fontSize: 13, fontWeight: "500" },
  seeAll: { fontSize: 14, fontWeight: "600" },
  group: { paddingHorizontal: gutter, paddingTop: space.xl, gap: space.md },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  groupTitle: { fontSize: 13, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  clear: { fontSize: 13, textDecorationLine: "underline" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chipText: { fontSize: 13 },
  hint: { textAlign: "center", marginTop: space.xxl, paddingHorizontal: gutter, opacity: 0.7 },
});
