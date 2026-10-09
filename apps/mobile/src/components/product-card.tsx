import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { space, useColors } from "@/lib/app-settings";
import { formatMoney, imageUrl, isDiscounted } from "@/lib/format";
import type { ProductCardData } from "@/lib/queries";

// Product imagery is shown 3:4 portrait, as in Seeaash.
const IMAGE_RATIO = 3 / 4;

// Adapted from Seeaash's product card; colours come from the merchant's design.
export function ProductCard({
  product,
  width,
  showPrice = true,
}: {
  product: ProductCardData;
  width: number;
  showPrice?: boolean;
}) {
  const colors = useColors();
  const price = product.priceRange.minVariantPrice;
  const compareAt = product.compareAtPriceRange.minVariantPrice;
  const variesInPrice = price.amount !== product.priceRange.maxVariantPrice.amount;
  const onSale = isDiscounted(price, compareAt);

  return (
    <View style={{ width }} accessibilityLabel={product.title}>
      <View style={[styles.image, { width, height: width / IMAGE_RATIO }]}>
        <Image
          source={imageUrl(product.featuredImage?.url, width * 2)}
          alt={product.featuredImage?.altText ?? product.title}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
        {!product.availableForSale && (
          <View style={[styles.badge, { backgroundColor: colors.background }]}>
            <Text style={[styles.badgeText, { color: colors.text }]}>Sold out</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {product.title}
        </Text>
        {showPrice && (
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: onSale ? colors.accent : colors.text }]}>
              {variesInPrice ? "From " : ""}
              {formatMoney(price)}
            </Text>
            {onSale && (
              <Text style={[styles.compareAt, { color: colors.text }]}>{formatMoney(compareAt)}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: "#F5F3EF", overflow: "hidden" },
  info: { paddingTop: space.sm, gap: space.xs },
  title: { fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 },
  price: { fontSize: 13, fontWeight: "500" },
  compareAt: { fontSize: 12, opacity: 0.55, textDecorationLine: "line-through" },
  badge: { position: "absolute", left: 0, bottom: 0, paddingHorizontal: space.sm, paddingVertical: 3 },
  badgeText: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
});
