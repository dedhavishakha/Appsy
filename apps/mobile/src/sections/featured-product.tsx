import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { featuredProduct } from "@appsy/sections/manifests";
import { Button } from "@/components/button";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { useMoney } from "@/lib/currency";
import { imageUrl } from "@/lib/format";
import { PRODUCT_QUERY, type ProductData, type ProductDetail } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

type Settings = z.output<typeof featuredProduct.settings>;

// One product shown large, with its lowest price and a button to its page.
export function FeaturedProduct({ settings }: { settings: Settings }) {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const money = useMoney();
  const { data, isLoading } = useStorefront<ProductData>(
    ["product", settings.product],
    PRODUCT_QUERY,
    { id: settings.product },
    settings.product !== null,
  );

  if (!settings.product) return <PreviewNote text="Choose the product to feature." />;
  if (isLoading) return <View style={[styles.placeholder, { height: width * 1.25 }]} />;
  const product = data?.product;
  if (!product) return null;

  const open = () =>
    router.push({ pathname: "/products/[handle]", params: { handle: product.handle, id: product.id } });
  const price = lowestPrice(product);
  const image = product.featuredImage;

  return (
    <View style={styles.section}>
      {image && (
        <Pressable accessibilityRole="link" accessibilityLabel={product.title} onPress={open}>
          <Image
            source={imageUrl(image.url, width * 3)}
            alt={image.altText ?? product.title}
            contentFit="cover"
            transition={200}
            style={{ width, height: Math.round(width * 1.25) }}
          />
        </Pressable>
      )}
      <View style={styles.info}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {product.title}
        </Text>
        {price && (
          <Text style={[styles.price, { color: colors.text }]}>
            {price.varies ? "From " : ""}
            {money.format(price.lowest)}
          </Text>
        )}
        {settings.showDescription && product.description ? (
          <Text numberOfLines={3} style={[styles.description, { color: colors.text }]}>
            {product.description}
          </Text>
        ) : null}
        <Button title={settings.buttonLabel || "View product"} onPress={open} />
      </View>
    </View>
  );
}

function lowestPrice(product: ProductDetail) {
  const prices = product.variants.nodes.map((variant) => variant.price);
  if (prices.length === 0) return null;
  const lowest = prices.reduce((min, price) => (Number(price.amount) < Number(min.amount) ? price : min));
  return { lowest, varies: prices.some((price) => price.amount !== lowest.amount) };
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  placeholder: { marginTop: space.xxl, backgroundColor: "#F5F3EF" },
  info: { paddingHorizontal: gutter, paddingTop: space.lg, gap: space.sm, alignItems: "center" },
  title: { fontSize: 18, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" },
  price: { fontSize: 16, fontWeight: "500" },
  description: { fontSize: 14, lineHeight: 21, opacity: 0.8, textAlign: "center" },
});
