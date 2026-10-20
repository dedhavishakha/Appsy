import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { menuItems } from "@appsy/sections/manifests";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { menuItemTarget, openMenuTarget } from "@/lib/links";
import { BORDER, PRESSED, useMenuDrawer } from "@/lib/menu-drawer";
import { MENU_QUERY, type MenuData, type MenuItemData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

type Settings = z.output<typeof menuItems.settings>;

// The store's Shopify menu in the side menu, as on Seeaash: main items in a list, and
// those with sub-items open with + and close with −, one at a time.
export function MenuItems({ settings }: { settings: Settings }) {
  const menu = useStorefront<MenuData>(
    ["menu", settings.menu],
    MENU_QUERY,
    { handle: settings.menu },
    settings.menu !== null,
  );

  if (!settings.menu) return <PreviewNote text="Choose which Shopify menu to show here." />;
  if (menu.isLoading) return <ActivityIndicator style={styles.loading} />;
  const items = menu.data?.menu?.items ?? [];
  if (items.length === 0) {
    return <PreviewNote text="This menu is empty, or it was deleted in Shopify." />;
  }
  return <Branch items={items} level={0} capitals={settings.capitals} />;
}

function Branch({
  items,
  level,
  capitals,
}: {
  items: MenuItemData[];
  level: number;
  capitals: boolean;
}) {
  const { shop, theme } = useSettings();
  const { close } = useMenuDrawer();
  const [open, setOpen] = useState<string | null>(null);
  const main = level === 0;
  const labelStyle = [
    main ? styles.label : styles.childLabel,
    main && capitals && styles.capitals,
    { color: theme.colors.text },
  ];

  return (
    <View style={main ? undefined : styles.children}>
      {items.map((item) => {
        const children = item.items ?? [];
        const rowStyle = main ? styles.row : [styles.childRow, { paddingLeft: gutter + space.md * level }];
        if (children.length === 0) {
          return (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              onPress={() => {
                const target = menuItemTarget(item, shop);
                close(target ? () => openMenuTarget(target) : undefined);
              }}
              style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
            >
              <Text style={labelStyle}>{item.title}</Text>
            </Pressable>
          );
        }
        const expanded = open === item.id;
        return (
          <View key={item.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : item.id)}
              style={({ pressed }) => [rowStyle, styles.parent, pressed && styles.pressed]}
            >
              <Text style={[labelStyle, styles.grow]}>{item.title}</Text>
              <Ionicons name={expanded ? "remove" : "add"} size={18} color={theme.colors.text} />
            </Pressable>
            {expanded && <Branch items={children} level={level + 1} capitals={capitals} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: space.xl },
  row: {
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  parent: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1 },
  label: { fontSize: 14, fontWeight: "500" },
  capitals: { letterSpacing: 1.4, textTransform: "uppercase" },
  children: { backgroundColor: PRESSED, paddingVertical: space.xs },
  childRow: { paddingRight: gutter, paddingVertical: space.md },
  childLabel: { fontSize: 14 },
  pressed: { backgroundColor: PRESSED },
});
