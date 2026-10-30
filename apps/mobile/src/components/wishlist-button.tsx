import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet } from "react-native";
import { ga4AddToWishlist } from "@appsy/app-config";
import { ga4Product, useAnalytics } from "@/lib/analytics";
import { useColors } from "@/lib/app-settings";
import { useWishlist, type WishlistItem } from "@/lib/wishlist";

// Seeaash's heart: saves a product to the wishlist, or takes it off. "overlay" sits on a
// product card's picture; "plain" goes in the product page's header.
export function WishlistButton({
  item,
  variant = "overlay",
}: {
  item: WishlistItem;
  variant?: "overlay" | "plain";
}) {
  const colors = useColors();
  const wishlist = useWishlist();
  const { track, trackGa4 } = useAnalytics();
  const saved = wishlist.has(item.id);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        saved ? `Remove ${item.title} from your wishlist` : `Save ${item.title} to your wishlist`
      }
      accessibilityState={{ selected: saved }}
      hitSlop={10}
      onPress={() => {
        if (wishlist.toggle(item)) {
          track("wishlist_add", { productId: item.id });
          trackGa4(ga4AddToWishlist(item.price.currencyCode, ga4Product(item, item.price)));
        }
      }}
      style={variant === "overlay" ? styles.overlay : styles.plain}
    >
      <Ionicons
        name={saved ? "heart" : "heart-outline"}
        size={20}
        color={saved ? colors.brand : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  plain: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
