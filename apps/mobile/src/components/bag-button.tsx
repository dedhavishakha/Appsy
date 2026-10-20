import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useColors } from "@/lib/app-settings";
import { useCart } from "@/lib/cart";
import { Text } from "./text";

// The bag icon in the header, with the number of items in it.
export function BagButton() {
  const colors = useColors();
  const { data: cart } = useCart();
  const count = cart?.totalQuantity ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Bag, ${count} items` : "Bag"}
      onPress={() => router.push("/cart")}
      hitSlop={8}
      style={styles.button}
    >
      <Ionicons name="bag-outline" size={22} color={colors.text} />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.brand }]}>
          <Text style={[styles.count, { color: colors.background }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 6 },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  count: { fontSize: 10, fontWeight: "600" },
});
