import { Image } from "expo-image";
import { StyleSheet } from "react-native";
import { useSettings } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import { SHOP_BRAND_QUERY, type ShopBrandData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";
import { Text } from "./text";

const MAX_WIDTH = 160;

// The store's name and the logo from its Shopify brand settings, read once and shared.
export function useShopBrand() {
  return useStorefront<ShopBrandData>(["shop-brand"], SHOP_BRAND_QUERY, {});
}

// The logo in the header and the side menu: the one chosen in Theme settings, else the one
// in the store's Shopify brand settings, else the app's name (from Appsy), else the store's.
export function StoreLogo({ height = 28, align = "center" }: { height?: number; align?: "center" | "left" }) {
  const settings = useSettings();
  const { colors, logo } = settings.theme;
  const brand = useShopBrand();
  const name = settings.app?.name ?? brand.data?.shop.name ?? "";
  const brandLogo = brand.data?.shop.brand?.logo?.image;
  const position = align === "left" ? "left" : "center";

  if (logo) {
    // Its own shape when the design knows it (logos chosen since Theme settings).
    const width = logo.aspectRatio
      ? Math.min(MAX_WIDTH, logo.height * logo.aspectRatio)
      : MAX_WIDTH;
    return (
      <Image
        source={imageUrl(logo.url, width * 3)}
        style={{ height: logo.height, width }}
        contentFit="contain"
        contentPosition={position}
        accessibilityLabel={name || "Logo"}
      />
    );
  }
  if (brandLogo) {
    const ratio = brandLogo.width && brandLogo.height ? brandLogo.width / brandLogo.height : 3;
    const width = Math.min(MAX_WIDTH, height * ratio);
    return (
      <Image
        source={imageUrl(brandLogo.url, width * 3)}
        style={{ height, width }}
        contentFit="contain"
        contentPosition={position}
        accessibilityLabel={brandLogo.altText || name || "Logo"}
      />
    );
  }
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      style={[styles.name, { color: colors.text, textAlign: align }]}
    >
      {name}
    </Text>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 17, fontWeight: "600", maxWidth: 220 },
});
