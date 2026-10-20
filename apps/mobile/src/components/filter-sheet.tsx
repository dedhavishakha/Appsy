import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";
import type { Filter } from "@/lib/queries";
import { emptyFilters, filterInput, type FilterState } from "@/lib/sort";
import { Button } from "./button";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";

function toNumber(text: string) {
  const number = Number(text.replace(/[^\d.]/g, ""));
  return text.trim() === "" || Number.isNaN(number) ? undefined : number;
}

// The store's own filters (Shopify's Search & Discovery app), as in Seeaash: a group per
// filter with its values and how many products each has, colour swatches where the store
// set them up, and a price range. The parent gives it a new `key` each time it opens, so
// the choices start from `value`.
export function FilterSheet({
  visible,
  filters,
  value,
  currencyCode,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: Filter[];
  value: FilterState;
  // For the price range's label, from the products' prices.
  currencyCode?: string;
  onApply: (value: FilterState) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState<FilterState>(value);
  const [openId, setOpenId] = useState<string | null>(null);
  const [minText, setMinText] = useState(value.price?.min != null ? String(value.price.min) : "");
  const [maxText, setMaxText] = useState(value.price?.max != null ? String(value.price.max) : "");

  const toggle = (input: string) =>
    setDraft((current) => ({
      ...current,
      values: current.values.includes(input)
        ? current.values.filter((chosen) => chosen !== input)
        : [...current.values, input],
    }));

  const valueFilters = filters.filter((filter) => filter.type !== "PRICE_RANGE" && filter.values.length > 0);
  const hasPrice = filters.some((filter) => filter.type === "PRICE_RANGE");

  const apply = () => {
    onApply({ values: draft.values, price: { min: toNumber(minText), max: toNumber(maxText) } });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Filter"
      onClose={onClose}
      footer={
        <>
          <Button
            title="Clear all"
            variant="secondary"
            style={styles.footerButton}
            onPress={() => {
              setDraft(emptyFilters);
              setMinText("");
              setMaxText("");
            }}
          />
          <Button title="Show results" style={styles.footerButton} onPress={apply} />
        </>
      }
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {valueFilters.map((filter) => {
          const open = openId === filter.id;
          const chosen = filter.values.filter((option) => draft.values.includes(filterInput(option))).length;
          return (
            <View key={filter.id} style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenId(open ? null : filter.id)}
                style={styles.groupHeader}
              >
                <Text style={[styles.groupTitle, { color: colors.text }]}>
                  {filter.label}
                  {chosen ? ` (${chosen})` : ""}
                </Text>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.text} />
              </Pressable>
              {open ? (
                <View style={styles.values}>
                  {filter.values.map((option) => {
                    const input = filterInput(option);
                    const checked = draft.values.includes(input);
                    const swatch = filter.presentation === "SWATCH" ? option.swatch?.color : null;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        onPress={() => toggle(input)}
                        style={styles.valueRow}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={20}
                          color={checked ? colors.brand : colors.text}
                        />
                        {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
                        <Text style={[styles.valueLabel, { color: colors.text }]}>{option.label}</Text>
                        <Text style={[styles.count, { color: colors.text }]}>{option.count}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
        {hasPrice ? (
          <View style={styles.group}>
            <Text style={[styles.groupTitle, styles.priceTitle, { color: colors.text }]}>
              Price{currencyCode ? ` (${currencyCode})` : ""}
            </Text>
            <View style={styles.priceRow}>
              <TextInput
                placeholder="Min"
                keyboardType="number-pad"
                value={minText}
                onChangeText={setMinText}
                accessibilityLabel="Lowest price"
                style={[styles.priceInput, { color: colors.text }]}
              />
              <Text style={{ color: colors.text }}>to</Text>
              <TextInput
                placeholder="Max"
                keyboardType="number-pad"
                value={maxText}
                onChangeText={setMaxText}
                accessibilityLabel="Highest price"
                style={[styles.priceInput, { color: colors.text }]}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.lg },
  footerButton: { flex: 1, minWidth: 0, marginTop: 0 },
  group: { paddingHorizontal: gutter, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.lg,
  },
  groupTitle: { fontSize: 14, fontWeight: "600" },
  values: { paddingBottom: space.md },
  valueRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  valueLabel: { flex: 1, fontSize: 14 },
  count: { fontSize: 12, opacity: 0.6 },
  priceTitle: { paddingTop: space.lg },
  priceRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  priceInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
  },
});
