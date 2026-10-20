import { useContext } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { relatedProducts } from "@appsy/sections/manifests";
import { ProductCard } from "@/components/product-card";
import { SectionHeader } from "@/components/section-header";
import { gutter, space } from "@/lib/app-settings";
import { ProductContext } from "@/lib/page-context";
import { RELATED_PRODUCTS_QUERY, type RelatedProductsData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

type Settings = z.output<typeof relatedProducts.settings>;

const CARD_WIDTH = 158;

// Shopify's recommendations for the product on screen, in a sideways row.
export function RelatedProducts({ settings }: { settings: Settings }) {
  const product = useContext(ProductContext);
  const intent = settings.intent === "complementary" ? "COMPLEMENTARY" : "RELATED";
  const { data } = useStorefront<RelatedProductsData>(
    ["related-products", product?.id, intent],
    RELATED_PRODUCTS_QUERY,
    { productId: product?.id, intent },
    Boolean(product),
  );

  const products = (data?.productRecommendations ?? []).slice(0, settings.count);
  if (products.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={settings.heading || "You may also like"} />
      <FlatList
        horizontal
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProductCard product={item} width={CARD_WIDTH} showPrice={settings.showPrice} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        snapToInterval={CARD_WIDTH + space.md}
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  row: { paddingHorizontal: gutter, gap: space.md },
});
