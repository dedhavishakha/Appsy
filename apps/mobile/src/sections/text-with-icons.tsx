import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { iconText } from "@appsy/blocks/manifests";
import type { textWithIcons } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { FeatureIcon } from "@/components/feature-icon";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";

type Settings = z.output<typeof textWithIcons.settings>;
type ItemSettings = z.output<typeof iconText.settings>;

// Short promises with icons: a list, two per row, or a sideways-scrolling row.
export function TextWithIcons({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const items = readBlocks(blocks, iconText);
  if (items.length === 0) return null;

  if (settings.layout === "row") {
    const itemWidth = Math.round(width * 0.6);
    return (
      <View style={styles.section}>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Item item={item.settings} width={itemWidth} centred />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        />
      </View>
    );
  }

  const grid = settings.layout === "grid";
  const itemWidth = grid ? (width - gutter * 2 - space.lg) / 2 : width - gutter * 2;
  return (
    <View style={[styles.section, styles.grid]}>
      {items.map((item) => (
        <Item key={item.id} item={item.settings} width={itemWidth} centred={grid} />
      ))}
    </View>
  );
}

function Item({ item, width, centred }: { item: ItemSettings; width: number; centred: boolean }) {
  const colors = useColors();
  return (
    <View style={[{ width }, centred ? styles.centred : styles.side]}>
      <FeatureIcon name={item.icon} color={colors.brand} />
      <View style={[styles.words, centred && styles.centredWords]}>
        {item.heading ? (
          <Text
            accessibilityRole="header"
            style={[styles.heading, { color: colors.text }, centred && styles.centredText]}
          >
            {item.heading}
          </Text>
        ) : null}
        {item.text ? (
          <Text style={[styles.text, { color: colors.text }, centred && styles.centredText]}>
            {item.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  row: { paddingHorizontal: gutter, gap: space.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter, gap: space.lg },
  centred: { alignItems: "center", gap: space.sm },
  side: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  words: { flex: 1, gap: 2 },
  centredWords: { flex: 0, alignItems: "center" },
  heading: { fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: "500" },
  text: { fontSize: 13, lineHeight: 19, opacity: 0.75 },
  centredText: { textAlign: "center" },
});
