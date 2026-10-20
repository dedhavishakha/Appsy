import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { collection as collectionBlock } from "@appsy/blocks/manifests";
import type { collectionList } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { PreviewNote } from "@/components/preview-note";
import { SectionHeader } from "@/components/section-header";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import {
  COLLECTION_LIST_QUERY,
  type CollectionImage,
  type CollectionListData,
  type CollectionListItem,
} from "@/lib/queries";
import { isPreview } from "@/lib/settings";
import { useStorefront } from "@/lib/storefront";

type Settings = z.output<typeof collectionList.settings>;

// Width over height; "adapt" keeps each picture's own shape.
const RATIOS = { portrait: 4 / 5, square: 1 } as const;

type Card =
  | { id: string; collection: CollectionListItem; picture: CollectionImage | null; title: string }
  | { id: string; collection: null };

// Collections as pictures that open them (Prestige's "Collection list"). A block's own
// picture from Shopify Files comes first, then the collection's picture, then its first
// product's.
export function CollectionList({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const items = readBlocks(blocks, collectionBlock);
  const ids = items.flatMap((item) => (item.settings.collection ? [item.settings.collection] : []));
  const { data } = useStorefront<CollectionListData>(
    ["collection-list", ...ids],
    COLLECTION_LIST_QUERY,
    { ids },
    ids.length > 0,
  );
  const found = new Map(
    (data?.nodes ?? [])
      .filter((node): node is CollectionListItem => !!node && "handle" in node)
      .map((node) => [node.id, node]),
  );

  // Keep the merchant's order; skip collections that aren't chosen or no longer exist.
  const cards: Card[] = items.flatMap((item): Card[] => {
    const chosen = item.settings.collection;
    const match = chosen ? found.get(chosen) : undefined;
    if (!match) {
      // Only the editor's phone shows the gap, once it knows the collection is missing.
      const gone = chosen !== null && data !== undefined;
      return isPreview && (chosen === null || gone) ? [{ id: item.id, collection: null }] : [];
    }
    const image = item.settings.image;
    return [
      {
        id: item.id,
        collection: match,
        picture: image
          ? { url: image.url, width: image.width, height: image.height, altText: image.alt }
          : (match.image ?? match.products.nodes[0]?.featuredImage ?? null),
        title: item.settings.title || match.title,
      },
    ];
  });

  if (items.length === 0) return <PreviewNote text="Add collections to this section." />;
  if (cards.length === 0) return null;

  const usable = Math.min(width, 600) - gutter * 2;
  const cardWidth =
    settings.layout === "grid"
      ? (usable - space.md) / 2
      : settings.layout === "stack"
        ? usable
        : Math.max(140, usable * 0.45);
  const drawn = cards.map((card) => (
    <CollectionCard key={card.id} card={card} width={cardWidth} settings={settings} />
  ));

  return (
    <View style={styles.section}>
      {settings.heading ? <SectionHeader title={settings.heading} /> : null}
      {settings.layout === "scroll" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {drawn}
        </ScrollView>
      ) : (
        <View style={[styles.grid, settings.layout === "stack" && styles.stack]}>{drawn}</View>
      )}
    </View>
  );
}

function CollectionCard({ card, width, settings }: { card: Card; width: number; settings: Settings }) {
  const colors = useColors();

  if (!card.collection) {
    return (
      <View
        style={[
          styles.missing,
          { width, aspectRatio: settings.ratio === "adapt" ? 1 : RATIOS[settings.ratio] },
        ]}
      >
        <Text style={styles.missingText}>Choose a collection</Text>
      </View>
    );
  }

  const { collection, picture, title } = card;
  const ratio =
    settings.ratio === "adapt"
      ? picture?.width && picture.height
        ? picture.width / picture.height
        : 1
      : RATIOS[settings.ratio];

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={() =>
        router.push({
          pathname: "/collections/[handle]",
          params: { handle: collection.handle, id: collection.id },
        })
      }
      style={{ width }}
    >
      <View style={[styles.picture, { aspectRatio: ratio, backgroundColor: picture ? "#F5F3EF" : colors.brand }]}>
        {picture ? (
          <Image
            source={imageUrl(picture.url, width * 2)}
            alt={picture.altText || title}
            contentFit="cover"
            transition={200}
            style={styles.fill}
          />
        ) : null}
        {settings.names === "overlay" && (
          <View style={styles.scrim}>
            <Text style={styles.overlayName} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}
      </View>
      {settings.names === "below" && (
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    columnGap: space.md,
    rowGap: space.lg,
    paddingHorizontal: gutter,
  },
  stack: { flexDirection: "column" },
  row: { paddingHorizontal: gutter, gap: space.md },
  picture: { width: "100%", overflow: "hidden" },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: space.md,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  overlayName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  name: {
    marginTop: space.sm,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  missing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#B5B5B5",
  },
  missingText: { color: "#6B6B6B", fontSize: 13, textAlign: "center", padding: space.sm },
});
