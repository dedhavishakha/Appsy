import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { useCartActions } from "@/lib/cart";
import { flagFor, useCountry } from "@/lib/country";
import { BORDER, PRESSED } from "@/lib/menu-drawer";

// Seeaash's country picker: the countries the store sells to (Shopify Markets), each with
// its currency. Choosing one reloads prices in that country's currency and moves the bag
// there.
export default function CountryScreen() {
  const colors = useColors();
  const { country, countries, setCountry } = useCountry();
  const { moveToCountry } = useCartActions();
  const [query, setQuery] = useState("");

  if (countries.length === 0) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const search = query.trim().toLowerCase();
  const shown = countries.filter(
    (option) =>
      !search || option.name.toLowerCase().includes(search) || option.isoCode.toLowerCase() === search,
  );

  const choose = (code: string) => {
    if (code !== country) {
      setCountry(code);
      moveToCountry.mutate(code);
    }
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        {countries.length > 8 && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search countries"
            autoCorrect={false}
            accessibilityLabel="Search countries"
            style={[styles.search, { color: colors.text }]}
          />
        )}
        <Text style={[styles.note, { color: colors.text }]}>
          Prices, taxes and delivery depend on where your order ships.
        </Text>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(option) => option.isoCode}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item.isoCode === country;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(item.isoCode)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.flag}>{flagFor(item.isoCode)}</Text>
              <Text style={[styles.name, { color: colors.text }, selected && styles.selected]}>
                {item.name}
              </Text>
              <Text style={[styles.currency, { color: colors.text }]}>
                {item.currency.isoCode} {item.currency.symbol}
              </Text>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
            </Pressable>
          );
        }}
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
  flag: { fontSize: 20 },
  name: { flex: 1, fontSize: 14 },
  selected: { fontWeight: "600" },
  currency: { fontSize: 12, opacity: 0.7 },
});
