import { Pressable, StyleSheet, Text } from "react-native";
import { space, useSettings } from "@/lib/app-settings";

// A button in the merchant's style: shape and filled or outline from the theme.
export function Button({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, buttons } = useSettings().theme;
  const filled = buttons.style === "filled";
  const radius = buttons.shape === "pill" ? 999 : buttons.shape === "rounded" ? 8 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: radius,
          borderColor: colors.brand,
          backgroundColor: filled ? colors.brand : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: filled ? colors.background : colors.brand }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "center",
    minWidth: 160,
    marginTop: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderWidth: 1,
    alignItems: "center",
  },
  label: { fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "500" },
});
