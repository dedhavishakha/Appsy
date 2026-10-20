import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { space, useSettings } from "@/lib/app-settings";
import { Text } from "./text";

// A button in the merchant's style: shape and filled or outline from the theme. A secondary
// button is always outlined, next to a main one.
export function Button({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, buttons } = useSettings().theme;
  const filled = variant === "primary" && buttons.style === "filled";
  const radius = buttons.shape === "pill" ? 999 : buttons.shape === "rounded" ? 8 : 0;
  const labelColor = filled ? colors.background : colors.brand;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: radius,
          borderColor: colors.brand,
          backgroundColor: filled ? colors.brand : "transparent",
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{title}</Text>
      )}
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
    justifyContent: "center",
    minHeight: 46,
  },
  label: { fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "500" },
});
