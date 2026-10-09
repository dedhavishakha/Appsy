import { Image } from "expo-image";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import type { collectionTiles } from "@appsy/sections/manifests";
import { SectionHeader } from "@/components/section-header";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import {
  COLLECTION_TILES_QUERY,
  type CollectionTileData,
  type CollectionTilesData,
} from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

type Settings = z.output<typeof collectionTiles.settings>;

const ROW_TILE_WIDTH = 96;
const GRID_COLUMNS = 3;

export function CollectionTiles({ settings }: { settings: Settings }) {
  const { data } = useStorefront<CollectionTilesData>(
    ["collection-tiles", ...settings.collections],
    COLLECTION_TILES_QUERY,
    { ids: settings.collections },
    settings.collections.length > 0,
  );
  // Keep the merchant's order; skip collections that no longer exist.
  const tiles = (data?.nodes ?? []).filter(
    (node): node is CollectionTileData => !!node && "handle" in node,
  );
  if (tiles.length === 0) return null;

  return (
    <View style={styles.section}>
      {settings.heading ? <SectionHeader title={settings.heading} /> : null}
      {settings.layout === "grid" ? (
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <View key={tile.id} style={styles.gridCell}>
              <Tile tile={tile} shape={settings.shape} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={tiles}
          keyExtractor={(tile) => tile.id}
          renderItem={({ item }) => (
            <View style={{ width: ROW_TILE_WIDTH }}>
              <Tile tile={item} shape={settings.shape} />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function Tile({ tile, shape }: { tile: CollectionTileData; shape: Settings["shape"] }) {
  const colors = useColors();
  const radius = shape === "circle" ? 999 : shape === "rounded" ? 16 : 0;
  const image = tile.image?.url ?? tile.products.nodes[0]?.featuredImage?.url;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tile.title}
      onPress={() => router.push(`/collections/${tile.handle}`)}
    >
      <View style={[styles.image, { borderRadius: radius }]}>
        <Image
          source={imageUrl(image, 400)}
          alt={tile.image?.altText ?? tile.title}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>
        {tile.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  list: { paddingHorizontal: gutter, gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - space.sm / 2 },
  gridCell: { width: `${100 / GRID_COLUMNS}%`, padding: space.sm / 2, marginBottom: space.md },
  image: { width: "100%", aspectRatio: 1, overflow: "hidden", backgroundColor: "#F5F3EF" },
  label: {
    marginTop: space.sm,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
