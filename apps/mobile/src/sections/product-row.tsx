import { router } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { productRow } from "@appsy/sections/manifests";
import { Button } from "@/components/button";
import { ProductCard } from "@/components/product-card";
import { SectionHeader } from "@/components/section-header";
import { gutter, space } from "@/lib/app-settings";
import { PRODUCT_ROW_QUERY, type ProductRowData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

const CARD_WIDTH = 158;

export function ProductRow({ settings }: { settings: z.output<typeof productRow.settings> }) {
  const { data, isLoading } = useStorefront<ProductRowData>(
    ["product-row", settings.collection, settings.count],
    PRODUCT_ROW_QUERY,
    { id: settings.collection, first: settings.count },
    settings.collection !== null,
  );

  if (!settings.collection) return null;
  if (isLoading) return <RowPlaceholder />;
  const collection = data?.collection;
  if (!collection || collection.products.nodes.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={settings.heading || collection.title} />
      <FlatList
        horizontal
        data={collection.products.nodes}
        keyExtractor={(product) => product.id}
        renderItem={({ item }) => (
          <ProductCard product={item} width={CARD_WIDTH} showPrice={settings.showPrice} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={CARD_WIDTH + space.md}
        decelerationRate="fast"
      />
      {settings.viewAll && (
        <Button title="View all" onPress={() => router.push(`/collections/${collection.handle}`)} />
      )}
    </View>
  );
}

function RowPlaceholder() {
  return (
    <View style={[styles.section, styles.placeholder]}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.placeholderCard} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  list: { paddingHorizontal: gutter, gap: space.md },
  placeholder: { flexDirection: "row", gap: space.md, paddingHorizontal: gutter },
  placeholderCard: { width: CARD_WIDTH, height: (CARD_WIDTH * 4) / 3, backgroundColor: "#F5F3EF" },
});
