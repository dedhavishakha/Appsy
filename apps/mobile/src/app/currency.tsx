import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { useCountry } from "@/lib/country";
import {
  currencyFlag,
  currencyName,
  POPULAR_CURRENCIES,
  RATES_ATTRIBUTION_URL,
  useCurrency,
} from "@/lib/currency";
import { BORDER, PRESSED } from "@/lib/menu-drawer";

type Row = { code: string; title: string; subtitle?: string };

// Seeaash's currency picker: "Automatic" follows the phone's currency, or the shopper picks
// any currency the exchange rates cover. Prices are converted for display only; checkout
// charges the shopper's market currency, which this screen says.
export default function CurrencyScreen() {
  const colors = useColors();
  const { choice, setChoice, phoneCurrency, rates } = useCurrency();
  const { country, countries } = useCountry();
  const [query, setQuery] = useState("");

  if (!rates) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // What checkout charges in the shopper's market.
  const charged = countries.find((option) => option.isoCode === country)?.currency.isoCode;
  const available = Object.keys(rates.rates);
  const first = [...new Set([charged, ...POPULAR_CURRENCIES].filter((code): code is string => !!code))].filter(
    (code) => available.includes(code),
  );
  const rest = available.filter((code) => !first.includes(code)).sort();
  const search = query.trim().toLowerCase();
  const rows: Row[] = [
    ...(search
      ? []
      : [
          {
            code: "auto",
            title: "Automatic",
            subtitle: phoneCurrency ? `${phoneCurrency} · your phone's currency` : "Prices as the store sets them",
          },
        ]),
    ...[...first, ...rest]
      .map((code) => ({ code, title: `${currencyFlag(code)}  ${code} · ${currencyName(code)}` }))
      .filter((row) => !search || row.title.toLowerCase().includes(search)),
  ];

  const choose = (code: string) => {
    setChoice(code);
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search currencies"
          autoCorrect={false}
          accessibilityLabel="Search currencies"
          style={[styles.search, { color: colors.text }]}
        />
        <Text style={[styles.note, { color: colors.text }]}>
          {`Prices are converted for display.${charged ? ` Orders are charged in ${charged};` : ""} you'll see the exact amount at checkout.`}
        </Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item.code === choice;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(item.code)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: colors.text }, selected && styles.selected]}>{item.title}</Text>
                {item.subtitle ? (
                  <Text style={[styles.subtitle, { color: colors.text }]}>{item.subtitle}</Text>
                ) : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
            </Pressable>
          );
        }}
        ListFooterComponent={
          // ExchangeRate-API asks for this link wherever its rates are used.
          <Pressable
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(RATES_ATTRIBUTION_URL)}
            style={styles.attribution}
          >
            <Text style={[styles.attributionText, { color: colors.text }]}>
              Rates By Exchange Rate API
              {rates.updatedAt ? ` · updated ${new Date(rates.updatedAt).toISOString().slice(0, 10)}` : ""}
            </Text>
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { padding: gutter, gap: space.sm },
  search: { height: 42, paddingHorizontal: space.md, borderWidth: 1, borderColor: BORDER, fontSize: 14 },
  note: { fontSize: 12, opacity: 0.65 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  pressed: { backgroundColor: PRESSED },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 14 },
  selected: { fontWeight: "600" },
  subtitle: { fontSize: 12, opacity: 0.65 },
  attribution: { padding: space.xl },
  attributionText: { fontSize: 12, opacity: 0.65, textAlign: "center", textDecorationLine: "underline" },
});
