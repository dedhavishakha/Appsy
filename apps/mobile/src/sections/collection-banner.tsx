import { Image } from "expo-image";
import { useContext } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { collectionBanner } from "@appsy/sections/manifests";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import { CollectionContext } from "@/lib/page-context";

type Settings = z.output<typeof collectionBanner.settings>;

const HEIGHT_SHARE = { small: 0.5, medium: 0.75, large: 1 } as const;

// The collection's picture with its title, then its description, all from Shopify.
// Without a picture, the title and description as text.
export function CollectionBanner({ settings }: { settings: Settings }) {
  const collection = useContext(CollectionContext);
  const { width } = useWindowDimensions();
  const colors = useColors();
  if (!collection) return null;

  const image = settings.showImage ? collection.image : null;
  const description = settings.showDescription ? collection.description : "";
  const descriptionText = description ? (
    <Text style={[styles.description, { color: colors.text }]}>{description}</Text>
  ) : null;

  if (!image) {
    return (
      <View style={styles.plain}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {collection.title}
        </Text>
        {descriptionText}
      </View>
    );
  }

  return (
    <View style={styles.withImage}>
      <View style={{ width, height: Math.round(width * HEIGHT_SHARE[settings.height]) }}>
        <Image
          source={imageUrl(image.url, width * 3)}
          alt={image.altText ?? collection.title}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
        {settings.overlay > 0 && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${settings.overlay / 100})` }]}
          />
        )}
        <View style={styles.overImage}>
          <Text accessibilityRole="header" style={styles.titleOverImage}>
            {collection.title}
          </Text>
        </View>
      </View>
      {descriptionText}
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { paddingTop: space.xl, paddingHorizontal: gutter, gap: space.sm, alignItems: "center" },
  withImage: { gap: space.lg },
  title: { fontSize: 20, letterSpacing: 1.4, textTransform: "uppercase", textAlign: "center" },
  description: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.8,
    textAlign: "center",
    paddingHorizontal: gutter,
  },
  overImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: gutter,
  },
  titleOverImage: {
    color: "#FFFFFF",
    fontSize: 24,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
