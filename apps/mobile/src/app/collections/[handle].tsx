import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ProductCard } from "@/components/product-card";
import { gutter, space, useColors } from "@/lib/app-settings";
import { COLLECTION_QUERY, type CollectionData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

// A collection's products in two columns, opened from "View all" and collection tiles.
export default function CollectionScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { data, isLoading } = useStorefront<CollectionData>(
    ["collection", handle],
    COLLECTION_QUERY,
    { handle, first: 50 },
  );
  const cardWidth = (Math.min(width, 600) - gutter * 2 - space.md) / 2;
  const collection = data?.collection;

  return (
    <>
      <Stack.Screen options={{ title: collection?.title ?? "" }} />
      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator />
        </View>
      ) : !collection ? (
        <View style={styles.centred}>
          <Text style={{ color: colors.text }}>This collection isn't available.</Text>
        </View>
      ) : (
        <FlatList
          data={collection.products.nodes}
          keyExtractor={(product) => product.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: gutter, gap: space.xl },
  row: { gap: space.md },
});
