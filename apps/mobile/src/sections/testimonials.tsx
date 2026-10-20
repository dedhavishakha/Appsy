import Ionicons from "@expo/vector-icons/Ionicons";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { testimonial } from "@appsy/blocks/manifests";
import type { testimonials } from "@appsy/sections/manifests";
import { readBlocks } from "@/blocks/read";
import { SectionHeader } from "@/components/section-header";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";

type Settings = z.output<typeof testimonials.settings>;

// Customer quotes that swipe, one card at a time.
export function Testimonials({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const items = readBlocks(blocks, testimonial).filter((item) => item.settings.quote);
  if (items.length === 0) return null;
  const cardWidth = width - gutter * 2;

  return (
    <View style={styles.section}>
      {settings.heading ? <SectionHeader title={settings.heading} /> : null}
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        renderItem={({ item }) => {
          const stars = Number(item.settings.rating);
          return (
            <View style={[styles.card, { width: cardWidth }]}>
              {stars > 0 && (
                <View style={styles.stars} accessibilityLabel={`${stars} out of 5 stars`}>
                  {Array.from({ length: stars }, (_, index) => (
                    <Ionicons key={index} name="star" size={14} color={colors.accent} />
                  ))}
                </View>
              )}
              <Text style={[styles.quote, { color: colors.text }]}>
                “{item.settings.quote}”
              </Text>
              {item.settings.author ? (
                <Text style={[styles.author, { color: colors.text }]}>{item.settings.author}</Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl },
  row: { paddingHorizontal: gutter, gap: space.md },
  card: {
    padding: space.xl,
    gap: space.md,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4D4D4",
  },
  stars: { flexDirection: "row", gap: 2 },
  quote: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  author: { fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.7 },
});
