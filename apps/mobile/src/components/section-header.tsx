import { StyleSheet, Text, View } from "react-native";
import { gutter, space, useColors } from "@/lib/app-settings";

// Centred section title, the Seeaash default (docs/03).
export function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: gutter, marginBottom: space.lg },
  title: { fontSize: 16, letterSpacing: 1.6, textTransform: "uppercase", textAlign: "center" },
});
