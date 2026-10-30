import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BagButton } from "@/components/bag-button";
import { Text } from "@/components/text";
import { WishlistButton } from "@/components/wishlist-button";
import { useGa4ViewItem, useViewEvent } from "@/lib/analytics";
import { space, useColors, useSettings } from "@/lib/app-settings";
import { pageSections, ProductContext } from "@/lib/page-context";
import { PRODUCT_QUERY, type ProductData, type ProductDetail } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";
import { useWishlistEnabled, type WishlistItem } from "@/lib/wishlist";
import { Sections } from "@/sections";

// One product, drawn from the design's Product page: the Product details section with its
// blocks, plus any other sections the merchant added.
export default function ProductScreen() {
  // Banner links add the product's id, which still works after a handle is renamed.
  const { handle, id } = useLocalSearchParams<{ handle: string; id?: string }>();
  const settings = useSettings();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const wishlist = useWishlistEnabled();
  const { data, isLoading } = useStorefront<ProductData>(
    ["product", id ?? handle],
    PRODUCT_QUERY,
    id ? { id } : { handle },
  );
  useViewEvent("product_view", data?.product?.id);
  // Its lowest price, as the product page shows before a variant is chosen.
  const prices = data?.product?.variants.nodes.map((variant) => variant.price) ?? [];
  const lowest = prices.reduce<(typeof prices)[number] | undefined>(
    (cheapest, price) =>
      !cheapest || Number(price.amount) < Number(cheapest.amount) ? price : cheapest,
    undefined,
  );
  useGa4ViewItem(data?.product ?? undefined, lowest);

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!data?.product) {
    return (
      <View style={styles.centred}>
        <Text style={{ color: colors.text }}>This product isn't available.</Text>
      </View>
    );
  }

  const saved = wishlist ? savedItem(data.product) : null;
  return (
    <ProductContext.Provider value={data.product}>
      <Stack.Screen
        options={{
          title: "",
          // The wishlist heart next to the bag.
          ...(saved
            ? {
                headerRight: () => (
                  <View style={styles.headerButtons}>
                    <WishlistButton item={saved} variant="plain" />
                    <BagButton />
                  </View>
                ),
              }
            : {}),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      >
        <Sections sections={pageSections(settings, "product")} />
      </ScrollView>
    </ProductContext.Provider>
  );
}

// The product as the wishlist keeps it, at its lowest price.
function savedItem(product: ProductDetail): WishlistItem | null {
  const prices = product.variants.nodes.map((variant) => variant.price);
  const lowest = prices.reduce<(typeof prices)[number] | undefined>(
    (low, price) => (!low || Number(price.amount) < Number(low.amount) ? price : low),
    undefined,
  );
  if (!lowest) return null;
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    image: product.featuredImage,
    price: lowest,
  };
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
