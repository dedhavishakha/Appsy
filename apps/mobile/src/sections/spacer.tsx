import { StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { spacer } from "@appsy/sections/manifests";
import { gutter, useColors } from "@/lib/app-settings";

type Settings = z.output<typeof spacer.settings>;

// Empty space between sections, optionally in a theme colour or with a line.
export function Spacer({ settings }: { settings: Settings }) {
  const colors = useColors();
  const background =
    settings.background === "brand"
      ? colors.brand
      : settings.background === "accent"
        ? colors.accent
        : "transparent";
  return (
    <View style={[styles.space, { height: settings.height, backgroundColor: background }]}>
      {settings.showLine && <View style={styles.line} />}
    </View>
  );
}

const styles = StyleSheet.create({
  space: { justifyContent: "center" },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: "#D4D4D4", marginHorizontal: gutter },
});
