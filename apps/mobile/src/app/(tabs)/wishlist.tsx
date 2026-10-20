import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/button";
import { ProductCard } from "@/components/product-card";
import { Text } from "@/components/text";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { useCartActions } from "@/lib/cart";
import {
  WISHLIST_PRODUCTS_QUERY,
  type ProductCardData,
  type WishlistProductData,
  type WishlistProductsData,
} from "@/lib/queries";
import { isPreview } from "@/lib/settings";
import { useStorefront } from "@/lib/storefront";
import { useWishlist, type WishlistItem } from "@/lib/wishlist";

// Seeaash's wishlist: the saved products, newest first, with today's price and stock from
// Shopify (the saved copy shows until then, or offline). Hearts take items off.
export default function WishlistScreen() {
  const { colors } = useSettings().theme;
  const { width } = useWindowDimensions();
  const { items } = useWishlist();
  const ids = items.map((item) => item.id);
  const fresh = useStorefront<WishlistProductsData>(
    ["wishlist-products", ids],
    WISHLIST_PRODUCTS_QUERY,
    { ids },
    ids.length > 0,
  );
  const cardWidth = (width - gutter * 2 - space.md) / 2;

  // Shopify answers in the order asked, with null for products no longer on sale in the app.
  const now = new Map<string, WishlistProductData | null>();
  fresh.data?.nodes.forEach((node, index) => {
    const id = ids[index];
    if (id) now.set(id, isProduct(node) ? node : null);
  });

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.background }]}>
        <Ionicons name="heart-outline" size={40} color={colors.text} />
        <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.text }]}>
          Your wishlist is empty
        </Text>
        <Text style={[styles.emptyText, { color: colors.text }]}>
          Tap the heart on any product to save it here.
        </Text>
        <Button title="Start shopping" onPress={() => router.navigate("/")} style={styles.start} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      refreshing={fresh.isRefetching}
      onRefresh={() => fresh.refetch()}
      ListHeaderComponent={
        <Text style={[styles.count, { color: colors.text }]}>
          {items.length === 1 ? "1 saved product" : `${items.length} saved products`}
        </Text>
      }
      renderItem={({ item }) => {
        const product = now.get(item.id);
        return (
          <View style={[styles.cell, { width: cardWidth }]}>
            <ProductCard
              product={product ?? fromSaved(item, product !== null)}
              width={cardWidth}
            />
            {product && <AddToBag product={product} />}
          </View>
        );
      }}
    />
  );
}

function isProduct(node: WishlistProductsData["nodes"][number]): node is WishlistProductData {
  return node !== null && "id" in node;
}

// A saved product drawn from what the phone kept. `available` is false once Shopify says
// it's gone.
function fromSaved(item: WishlistItem, available: boolean): ProductCardData {
  return {
    id: item.id,
    handle: item.handle,
    title: item.title,
    availableForSale: available,
    featuredImage: item.image,
    priceRange: { minVariantPrice: item.price, maxVariantPrice: item.price },
    compareAtPriceRange: { minVariantPrice: item.price },
  };
}

// A product with one variant goes straight into the bag; one with options opens its page,
// where the shopper picks them.
function AddToBag({ product }: { product: WishlistProductData }) {
  const { add } = useCartActions();
  const variants = product.variants.nodes;
  const only = variants.length === 1 ? variants[0] : undefined;

  if (!product.availableForSale) {
    return <Button title="Sold out" variant="secondary" disabled onPress={() => {}} />;
  }
  if (!only) {
    return (
      <Button
        title="Choose options"
        variant="secondary"
        onPress={() => router.push(`/products/${product.handle}`)}
      />
    );
  }
  return (
    <View style={styles.cell}>
      <Button
        title="Add to bag"
        variant="secondary"
        loading={add.isPending}
        onPress={() => {
          // The editor's preview shows the button without creating carts on the store.
          if (isPreview) return;
          add.mutate(only.id, { onSuccess: () => router.push("/cart") });
        }}
      />
      {add.error ? <Text style={styles.error}>{add.error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  row: { gap: space.md, marginBottom: space.xl },
  cell: { gap: space.sm },
  count: { paddingVertical: space.md, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
    gap: space.md,
  },
  emptyTitle: { fontSize: 18, textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", opacity: 0.75 },
  start: { marginTop: space.md, alignSelf: "stretch" },
  error: { color: "#B42318", fontSize: 12 },
});
