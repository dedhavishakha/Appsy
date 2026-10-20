import { Image } from "expo-image";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { column } from "@appsy/blocks/manifests";
import type { multiColumn } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { Linked } from "@/components/linked";
import { SectionHeader } from "@/components/section-header";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";

type Settings = z.output<typeof multiColumn.settings>;
type ColumnSettings = z.output<typeof column.settings>;

// Columns of pictures and text: two per row, one per row, or a sideways-scrolling row.
export function MultiColumn({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const columns = readBlocks(blocks, column);
  if (columns.length === 0) return null;
  const header = settings.heading ? <SectionHeader title={settings.heading} /> : null;

  if (settings.layout === "scroll") {
    const itemWidth = Math.round(width * 0.62);
    return (
      <View style={styles.section}>
        {header}
        <FlatList
          horizontal
          data={columns}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Column item={item.settings} width={itemWidth} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          snapToInterval={itemWidth + space.md}
          decelerationRate="fast"
        />
      </View>
    );
  }

  const perRow = settings.layout === "grid" ? 2 : 1;
  const itemWidth = (width - gutter * 2 - space.md * (perRow - 1)) / perRow;
  return (
    <View style={styles.section}>
      {header}
      <View style={styles.grid}>
        {columns.map((item) => (
          <Column key={item.id} item={item.settings} width={itemWidth} />
        ))}
      </View>
    </View>
  );
}

function Column({ item, width }: { item: ColumnSettings; width: number }) {
  const colors = useColors();
  return (
    <Linked link={item.link} label={item.heading}>
      <View style={{ width, gap: space.sm }}>
        {item.image && (
          <Image
            source={imageUrl(item.image.url, width * 3)}
            alt={item.image.alt || item.heading}
            contentFit="cover"
            transition={200}
            style={{
              width,
              height: Math.round(width * Math.min(item.image.height / item.image.width, 1.5)),
            }}
          />
        )}
        {item.heading ? (
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            {item.heading}
          </Text>
        ) : null}
        {item.text ? <Text style={[styles.text, { color: colors.text }]}>{item.text}</Text> : null}
      </View>
    </Linked>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  row: { paddingHorizontal: gutter, gap: space.md },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: gutter,
    columnGap: space.md,
    rowGap: space.xl,
  },
  heading: { fontSize: 14, letterSpacing: 1, textTransform: "uppercase" },
  text: { fontSize: 14, lineHeight: 21, opacity: 0.8 },
});
