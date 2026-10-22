import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";
import licences from "@/lib/licences.json";

// Open-source licences, from the side menu: the copyright notice of each font and icon set the
// app carries, and their licence texts, as the SIL Open Font License (condition 2) and the MIT
// licence ask of every copy. The list comes from scripts/write-licences.mjs.

const LICENCE_NAMES: Record<string, string> = {
  "OFL-1.1": "SIL Open Font License 1.1",
  MIT: "MIT License",
};

export default function LicencesScreen() {
  const { colors } = useSettings().theme;
  const color = { color: colors.text };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.intro, color]}>
        This app uses these fonts and icons, under the licences below.
      </Text>
      {licences.items.map((item) => (
        <View key={item.name} style={[styles.row, { borderBottomColor: BORDER }]}>
          <Text style={[styles.label, color]}>{item.name}</Text>
          <Text selectable style={[styles.note, color]}>
            {item.notice}
          </Text>
          <Text style={[styles.note, color]}>{LICENCE_NAMES[item.licence]}</Text>
        </View>
      ))}
      {Object.entries(licences.texts).map(([id, body]) => (
        <View key={id} style={styles.licence}>
          <Text accessibilityRole="header" style={[styles.heading, color]}>
            {LICENCE_NAMES[id]}
          </Text>
          <Text selectable style={[styles.body, color]}>
            {body}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  intro: { fontSize: 13, lineHeight: 19, opacity: 0.7, marginBottom: space.sm },
  row: { gap: space.xs, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.7 },
  licence: { gap: space.sm, paddingTop: space.xl },
  heading: { fontSize: 17 },
  body: { fontSize: 12, lineHeight: 18, opacity: 0.8 },
});
