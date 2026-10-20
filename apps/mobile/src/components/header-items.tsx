import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSettings } from "@/lib/app-settings";
import { flagFor, useCountry } from "@/lib/country";
import { currencyFlag, useCurrency } from "@/lib/currency";
import { BagButton } from "./bag-button";
import { MenuButton } from "./menu-drawer";
import { Text } from "./text";

// The buttons the design puts on one side of Home's header, in its order. Wishlist and
// account buttons come with those features.
export function HeaderItems({ ids }: { ids: string[] }) {
  const settings = useSettings();
  const { countries } = useCountry();
  const { enabled: converting } = useCurrency();
  const items = ids.flatMap((id) => {
    switch (id) {
      // The side menu always has Privacy choices, so the button always shows.
      case "menu":
        return [<MenuButton key={id} />];
      case "search":
        return [<SearchButton key={id} />];
      // With currency conversion on (Appsy's Settings), the shopper's currency; otherwise
      // their country, when the store sells to more than one.
      case "currency":
        if (converting) return [<CurrencyButton key={id} />];
        return countries.length > 1 ? [<CountryButton key={id} />] : [];
      case "bag":
        return [<BagButton key={id} />];
      default:
        return [];
    }
  });
  if (items.length === 0) return null;
  return <View style={styles.row}>{items}</View>;
}

function SearchButton() {
  const { colors } = useSettings().theme;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search"
      hitSlop={8}
      onPress={() => router.push("/search")}
      style={styles.button}
    >
      <Ionicons name="search-outline" size={22} color={colors.text} />
    </Pressable>
  );
}

// The shopper's country flag and currency, e.g. "🇮🇳 INR"; opens the country picker.
function CountryButton() {
  const { colors } = useSettings().theme;
  const { country, countries } = useCountry();
  const currency = countries.find((option) => option.isoCode === country)?.currency.isoCode ?? "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Country or region, ${country}, prices in ${currency}`}
      hitSlop={8}
      onPress={() => router.push("/country")}
      style={[styles.button, styles.country]}
    >
      <Text style={styles.flag}>{flagFor(country)}</Text>
      <Text style={[styles.currency, { color: colors.text }]}>{currency}</Text>
    </Pressable>
  );
}

// The currency prices are shown in, e.g. "🇮🇳 INR"; opens the currency picker.
function CurrencyButton() {
  const { colors } = useSettings().theme;
  const { display } = useCurrency();
  const { country, countries } = useCountry();
  const currency = display ?? countries.find((option) => option.isoCode === country)?.currency.isoCode ?? "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Currency, ${currency}. Change currency`}
      hitSlop={8}
      onPress={() => router.push("/currency")}
      style={[styles.button, styles.country]}
    >
      <Text style={styles.flag}>{currency ? currencyFlag(currency) : "🌐"}</Text>
      <Text style={[styles.currency, { color: colors.text }]}>{currency}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  button: { padding: 6 },
  country: { flexDirection: "row", alignItems: "center", gap: 4 },
  flag: { fontSize: 16 },
  currency: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
});
