import { Image } from "expo-image";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { card } from "@appsy/blocks/manifests";
import type { scrollingContent } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { Linked } from "@/components/linked";
import { SectionHeader } from "@/components/section-header";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";

type Settings = z.output<typeof scrollingContent.settings>;

const CARD_SHARE = { small: 0.45, medium: 0.62, large: 0.8 } as const;

// A sideways-scrolling row of portrait picture cards with text.
export function ScrollingContent({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const cards = readBlocks(blocks, card);
  if (cards.length === 0) return null;
  const cardWidth = Math.round(width * CARD_SHARE[settings.cardSize]);

  return (
    <View style={styles.section}>
      {settings.heading ? <SectionHeader title={settings.heading} /> : null}
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        renderItem={({ item: { settings: item } }) => (
          <Linked link={item.link} label={item.heading}>
            <View style={{ width: cardWidth, gap: space.sm }}>
              <View
                style={[
                  styles.picture,
                  { height: Math.round(cardWidth * 1.25) },
                  !item.image && { backgroundColor: colors.brand },
                ]}
              >
                {item.image && (
                  <Image
                    source={imageUrl(item.image.url, cardWidth * 3)}
                    alt={item.image.alt || item.heading}
                    contentFit="cover"
                    transition={200}
                    style={StyleSheet.absoluteFill}
                  />
                )}
              </View>
              {item.heading ? (
                <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
                  {item.heading}
                </Text>
              ) : null}
              {item.text ? (
                <Text style={[styles.text, { color: colors.text }]}>{item.text}</Text>
              ) : null}
            </View>
          </Linked>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  row: { paddingHorizontal: gutter, gap: space.md },
  picture: { overflow: "hidden", backgroundColor: "#F5F3EF" },
  heading: { fontSize: 14, letterSpacing: 1, textTransform: "uppercase" },
  text: { fontSize: 13, lineHeight: 19, opacity: 0.8 },
});
