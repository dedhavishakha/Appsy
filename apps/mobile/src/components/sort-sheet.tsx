import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet } from "react-native";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";
import type { SortOption } from "@/lib/sort";
import { Sheet } from "./sheet";
import { Text } from "./text";

export function SortSheet({
  visible,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: SortOption[];
  selected: SortOption;
  onSelect: (option: SortOption) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Sheet visible={visible} title="Sort by" onClose={onClose}>
      {options.map((option) => {
        const active = option.id === selected.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onSelect(option);
              onClose();
            }}
            style={styles.row}
          >
            <Text style={[styles.label, { color: colors.text }, active && styles.active]}>
              {option.label}
            </Text>
            {active ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  label: { fontSize: 14 },
  active: { fontWeight: "600" },
});
