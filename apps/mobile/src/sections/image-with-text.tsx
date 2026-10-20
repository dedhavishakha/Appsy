import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { imageWithText } from "@appsy/sections/manifests";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { paragraphs } from "@/lib/text";

type Settings = z.output<typeof imageWithText.settings>;

// A full-width picture with a heading, text and button above or below it.
export function ImageWithText({ settings }: { settings: Settings }) {
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { image, link } = settings;
  const body = paragraphs(settings.text);

  const picture = image ? (
    <Image
      source={imageUrl(image.url, width * 3)}
      alt={image.alt || settings.heading}
      contentFit="cover"
      transition={200}
      style={{ width, height: Math.round(width * Math.min(image.height / image.width, 1.4)) }}
    />
  ) : null;

  return (
    <View style={styles.section}>
      {settings.imageFirst && picture}
      <View style={styles.words}>
        {settings.heading ? (
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            {settings.heading}
          </Text>
        ) : null}
        {body.map((paragraph, index) => (
          <Text key={index} style={[styles.text, { color: colors.text }]}>
            {paragraph}
          </Text>
        ))}
        {settings.buttonLabel && link ? (
          <Button title={settings.buttonLabel} onPress={() => openLink(link)} />
        ) : null}
      </View>
      {!settings.imageFirst && picture}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl, gap: space.lg },
  words: { paddingHorizontal: gutter, gap: space.md, alignItems: "center" },
  heading: { fontSize: 20, lineHeight: 26, letterSpacing: 0.6, textAlign: "center" },
  text: { fontSize: 15, lineHeight: 23, opacity: 0.85, textAlign: "center" },
});
