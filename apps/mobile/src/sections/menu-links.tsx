import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { callUs, countryPicker, emailUs, menuLink, whatsappChat } from "@appsy/blocks/manifests";
import type { menuLinks } from "@appsy/sections/manifests";
import { LINK_GLYPHS, type Glyph } from "@/components/feature-icon";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { flagFor, useCountry, type CountryControls } from "@/lib/country";
import { currencyFlag, useCurrency, type CurrencyControls } from "@/lib/currency";
import { callPhone, openLink, openWhatsApp, sendEmail } from "@/lib/links";
import { PRESSED, useMenuDrawer } from "@/lib/menu-drawer";
import { isPreview } from "@/lib/settings";

type Settings = z.output<typeof menuLinks.settings>;

// What a row shows and does. `value` sits on the right; `missing` says what the row still
// needs: such rows show only in the editor's preview.
type Row = { id: string; icon: Glyph; label: string; value?: string; open: () => void; missing?: string };

// Seeaash's rows with icons under the menu: store pages, chat, call, email, social links,
// and the shopper's country and currency.
export function MenuLinks({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const colors = useColors();
  const { close } = useMenuDrawer();
  const country = useCountry();
  const currency = useCurrency();
  const rows = blocks.flatMap((block) => readRow(block, country, currency));
  const shown = rows.filter((row) => !row.missing || isPreview);

  if (shown.length === 0) return <PreviewNote text="Add links to this section." />;
  return (
    <View style={styles.links}>
      {settings.heading ? (
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          {settings.heading}
        </Text>
      ) : null}
      {shown.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          disabled={Boolean(row.missing)}
          onPress={() => close(row.open)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name={row.icon} size={18} color={colors.text} />
          <Text style={[styles.label, { color: colors.text }]}>{row.label}</Text>
          {row.value ? <Text style={[styles.value, { color: colors.text }]}>{row.value}</Text> : null}
          {row.missing ? <Text style={styles.missing}>{row.missing}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function readRow(
  block: BlockInstance,
  { country, countries }: CountryControls,
  { enabled: converting, display }: CurrencyControls,
): Row[] {
  if (block.hidden) return [];
  const { id } = block;
  switch (block.type) {
    case countryPicker.id: {
      const parsed = countryPicker.settings.safeParse(block.settings);
      if (!parsed.success) return [];
      const charged = countries.find((option) => option.isoCode === country)?.currency.isoCode;
      const shown = display ?? charged;
      const rows: Row[] = [
        {
          id,
          icon: "globe-outline",
          label: parsed.data.label || "Shipping to",
          value: `${flagFor(country)} ${country}${!converting && charged ? ` · ${charged}` : ""}`,
          open: () => router.push("/country"),
          // A choice of one isn't a choice.
          missing: countries.length > 1 ? undefined : "Your store sells to one country",
        },
      ];
      if (converting) {
        rows.push({
          id: `${id}-currency`,
          icon: "cash-outline",
          label: parsed.data.currencyLabel || "Currency",
          value: shown ? `${currencyFlag(shown)} ${shown}` : undefined,
          open: () => router.push("/currency"),
        });
      }
      return rows;
    }
    case menuLink.id: {
      const parsed = menuLink.settings.safeParse(block.settings);
      if (!parsed.success) return [];
      const { icon, label, link } = parsed.data;
      return [
        {
          id,
          icon: LINK_GLYPHS[icon],
          label: label || "Link",
          open: () => link && openLink(link),
          missing: !label ? "Add a label" : !link ? "Add a link" : undefined,
        },
      ];
    }
    case whatsappChat.id: {
      const parsed = whatsappChat.settings.safeParse(block.settings);
      if (!parsed.success) return [];
      const { label, phone, message } = parsed.data;
      return [
        {
          id,
          icon: "logo-whatsapp",
          label: label || "Chat with us",
          open: () => openWhatsApp(phone, message),
          missing: phone ? undefined : "Add a number",
        },
      ];
    }
    case callUs.id: {
      const parsed = callUs.settings.safeParse(block.settings);
      if (!parsed.success) return [];
      const { label, phone } = parsed.data;
      return [
        {
          id,
          icon: "call-outline",
          label: label || "Call us",
          open: () => callPhone(phone),
          missing: phone ? undefined : "Add a number",
        },
      ];
    }
    case emailUs.id: {
      const parsed = emailUs.settings.safeParse(block.settings);
      if (!parsed.success) return [];
      const { label, email } = parsed.data;
      return [
        {
          id,
          icon: "mail-outline",
          label: label || "Email us",
          open: () => sendEmail(email),
          missing: email ? undefined : "Add an email",
        },
      ];
    }
    // Rows from newer Appsy versions that this app doesn't know.
    default:
      return [];
  }
}

const styles = StyleSheet.create({
  links: { marginTop: space.lg },
  heading: {
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
  },
  label: { flex: 1, fontSize: 14 },
  value: { fontSize: 12, opacity: 0.7 },
  missing: { fontSize: 12, color: "#8A8A8A" },
  pressed: { backgroundColor: PRESSED },
});
