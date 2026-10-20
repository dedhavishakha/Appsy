import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/components/text";
import { useAnalytics } from "@/lib/analytics";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";

// Privacy choices, from the side menu: the shopper's answer about usage data, which they can
// change at any time, and the store's privacy policy.
export default function PrivacyScreen() {
  const settings = useSettings();
  const { colors } = settings.theme;
  const { consent, setConsent } = useAnalytics();
  const name = settings.app?.name ?? "this store";

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.row, { borderBottomColor: BORDER }]}>
        <View style={styles.words}>
          <Text style={[styles.label, { color: colors.text }]}>Share usage data</Text>
          <Text style={[styles.note, { color: colors.text }]}>
            Anonymous data about how you use the app, like which products you view and add to
            your bag, helps {name} improve it. It's never linked to your name or email.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Share usage data"
          value={consent === "granted"}
          onValueChange={setConsent}
          trackColor={{ true: colors.brand }}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(settings.links.privacyPolicy)}
        style={[styles.row, { borderBottomColor: BORDER }]}
      >
        <Text style={[styles.label, { color: colors.text }]}>Privacy policy</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  words: { flex: 1, gap: space.xs },
  label: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.7 },
});
