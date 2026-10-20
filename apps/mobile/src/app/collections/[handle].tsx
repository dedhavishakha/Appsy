import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useViewEvent } from "@/lib/analytics";
import { space, useColors, useSettings } from "@/lib/app-settings";
import { CollectionContext, nearEnd, pageSections } from "@/lib/page-context";
import { COLLECTION_QUERY, type CollectionData } from "@/lib/queries";
import { collectionSorts, emptyFilters, toProductFilters, type FilterState } from "@/lib/sort";
import { useStorefrontPages } from "@/lib/storefront";
import { Sections } from "@/sections";

const PAGE_SIZE = 24;

// A collection, drawn from the design's Collection page (its Product grid and any other
// sections), opened from "View all", collection tiles and links. Its products load a page
// at a time, in the shopper's chosen order and filters.
export default function CollectionScreen() {
  // Banner links add the collection's id, which still works after a handle is renamed.
  const { handle, id } = useLocalSearchParams<{ handle: string; id?: string }>();
  const settings = useSettings();
  const colors = useColors();
  const [sort, setSort] = useState(collectionSorts[0]);
  const [filterState, setFilterState] = useState<FilterState>(emptyFilters);
  const query = useStorefrontPages<CollectionData>(
    ["collection", id ?? handle, sort.id, filterState],
    COLLECTION_QUERY,
    {
      ...(id ? { id } : { handle }),
      first: PAGE_SIZE,
      sortKey: sort.sortKey,
      reverse: sort.reverse,
      filters: toProductFilters(filterState),
    },
    (page) => {
      const pageInfo = page.collection?.products.pageInfo;
      return pageInfo?.hasNextPage ? pageInfo.endCursor : null;
    },
  );
  const pages = query.data?.pages ?? [];
  const collection = pages[0]?.collection;
  const products = pages.flatMap((page) => page.collection?.products.nodes ?? []);
  useViewEvent("collection_view", collection?.id);

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };

  return (
    <>
      <Stack.Screen options={{ title: collection?.title ?? "" }} />
      {query.isPending ? (
        <View style={styles.centred}>
          <ActivityIndicator />
        </View>
      ) : !collection ? (
        <View style={styles.centred}>
          <Text style={{ color: colors.text }}>
            {query.isError ? "This collection couldn't load." : "This collection isn't available."}
          </Text>
        </View>
      ) : (
        <CollectionContext.Provider
          value={{
            title: collection.title,
            description: collection.description,
            image: collection.image,
            products,
            listing: {
              filters: collection.products.filters,
              sortOptions: collectionSorts,
              sort,
              onSortChange: setSort,
              filterState,
              onFilterChange: setFilterState,
              count: query.hasNextPage ? undefined : products.length,
              updating: query.isPlaceholderData,
              loadingMore: query.isFetchingNextPage,
            },
          }}
        >
          <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={styles.content}
            onScroll={(event) => nearEnd(event) && loadMore()}
            scrollEventThrottle={200}
          >
            <Sections sections={pageSections(settings, "collection")} />
          </ScrollView>
        </CollectionContext.Provider>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: space.xxl },
});
