import { StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { richText } from "@appsy/sections/manifests";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { openLink } from "@/lib/links";
import { paragraphs } from "@/lib/text";

type Settings = z.output<typeof richText.settings>;

// A heading, paragraphs and an optional button.
export function RichText({ settings }: { settings: Settings }) {
  const colors = useColors();
  const body = paragraphs(settings.text);
  const { link } = settings;
  if (!settings.heading && body.length === 0) return null;
  const left = settings.alignment === "left";
  const textAlign = left ? "left" : "center";

  return (
    <View style={[styles.section, { alignItems: left ? "flex-start" : "center" }]}>
      {settings.heading ? (
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text, textAlign }]}>
          {settings.heading}
        </Text>
      ) : null}
      {body.map((paragraph, index) => (
        <Text key={index} style={[styles.text, { color: colors.text, textAlign }]}>
          {paragraph}
        </Text>
      ))}
      {settings.buttonLabel && link ? (
        <Button
          title={settings.buttonLabel}
          onPress={() => openLink(link)}
          style={left ? styles.buttonLeft : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl, paddingHorizontal: gutter, gap: space.md },
  heading: { fontSize: 20, lineHeight: 26, letterSpacing: 0.6 },
  text: { fontSize: 15, lineHeight: 23, opacity: 0.85 },
  buttonLeft: { alignSelf: "flex-start" },
});
