import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { tile } from "@appsy/blocks/manifests";
import type { mediaGrid } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { Linked } from "@/components/linked";
import { SectionHeader } from "@/components/section-header";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";

type Settings = z.output<typeof mediaGrid.settings>;
type TileSettings = z.output<typeof tile.settings>;

const GAP = space.sm;

// A grid of pictures with headings over them; "mosaic" makes the first one full width.
export function MediaGrid({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const tiles = readBlocks(blocks, tile);
  if (tiles.length === 0) return null;
  const inner = width - gutter * 2;
  const half = (inner - GAP) / 2;

  return (
    <View style={styles.section}>
      {settings.heading ? <SectionHeader title={settings.heading} /> : null}
      <View style={styles.grid}>
        {tiles.map((item, index) => {
          const large = settings.layout === "mosaic" && index === 0;
          return (
            <Tile
              key={item.id}
              item={item.settings}
              width={large ? inner : half}
              height={large ? Math.round(inner * 0.75) : half}
            />
          );
        })}
      </View>
    </View>
  );
}

function Tile({ item, width, height }: { item: TileSettings; width: number; height: number }) {
  const colors = useColors();
  return (
    <Linked link={item.link} label={item.heading}>
      <View style={[styles.tile, { width, height }, !item.image && { backgroundColor: colors.brand }]}>
        {item.image && (
          <Image
            source={imageUrl(item.image.url, width * 3)}
            alt={item.image.alt || item.heading}
            contentFit="cover"
            transition={200}
            style={StyleSheet.absoluteFill}
          />
        )}
        {item.heading ? (
          <View style={styles.caption}>
            <Text accessibilityRole="header" style={styles.captionText}>
              {item.heading}
            </Text>
          </View>
        ) : null}
      </View>
    </Linked>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter, gap: GAP },
  tile: { overflow: "hidden", backgroundColor: "#F5F3EF", justifyContent: "flex-end" },
  caption: { padding: space.md, backgroundColor: "rgba(0, 0, 0, 0.25)" },
  captionText: { color: "#FFFFFF", fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" },
});
