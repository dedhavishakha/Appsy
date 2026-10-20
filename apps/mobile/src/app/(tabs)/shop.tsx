import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import type { PublishedSettings } from "@appsy/app-config";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import { menuItemTarget, openMenuTarget } from "@/lib/links";
import { BORDER } from "@/lib/menu-drawer";
import { SHOP_MENU_QUERY, type ShopMenuData, type ShopMenuItemData } from "@/lib/queries";
import { useStorefront } from "@/lib/storefront";

// Shopify stores start with a "Main menu" (handle main-menu).
const MAIN_MENU = "main-menu";

const EMPTY_MENU_NOTE =
  "The Shop tab shows your side menu's Shopify menu, else your store's main menu. Add items " +
  "to it in Shopify under Online Store › Navigation.";

// The Shopify menu the Shop tab shows: the one the side menu lists (the Menu page's Shopify
// menu section), else the store's main menu.
function shopMenuHandle(settings: PublishedSettings): string {
  const section = settings.pages.menu.sections.find((candidate) => candidate.type === "menu-items");
  const menu = section?.settings.menu;
  return typeof menu === "string" && menu ? menu : MAIN_MENU;
}

// Seeaash's Shop tab: the menu's groups (items with sub-items) as chips, the chosen group's
// items as picture tiles, and single items as links below. Menu changes made in Shopify
// show without publishing again.
export default function ShopScreen() {
  const settings = useSettings();
  const { colors } = settings.theme;
  const { width } = useWindowDimensions();
  const handle = shopMenuHandle(settings);
  const { data, isLoading, isError, refetch } = useStorefront<ShopMenuData>(
    ["shop-menu", handle],
    SHOP_MENU_QUERY,
    { handle },
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const items = data?.menu?.items ?? [];
  const groups = items.filter((item) => (item.items?.length ?? 0) > 0);
  const links = items.filter((item) => (item.items?.length ?? 0) === 0);
  const active = groups.find((group) => group.id === activeId) ?? groups[0];
  const tileWidth = (width - gutter * 2 - space.md) / 2;

  const open = (item: ShopMenuItemData) => {
    const target = menuItemTarget(item, settings.shop);
    if (target) openMenuTarget(target);
  };

  if (isLoading) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>The shop couldn't load.</Text>
        <Pressable accessibilityRole="button" onPress={() => refetch()}>
          <Text style={[styles.retry, { color: colors.text }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <PreviewNote text={EMPTY_MENU_NOTE} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {groups.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="tablist"
        >
          {groups.map((group) => {
            const selected = group.id === active?.id;
            return (
              <Pressable
                key={group.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveId(group.id)}
                style={[
                  styles.chip,
                  { borderColor: selected ? colors.text : BORDER },
                  selected && { backgroundColor: colors.text },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: selected ? colors.background : colors.text }]}
                >
                  {group.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {active && (
        <View style={styles.grid}>
          {(active.items ?? []).map((item) => (
            <Tile key={item.id} item={item} width={tileWidth} onPress={() => open(item)} />
          ))}
        </View>
      )}

      {links.length > 0 && (
        <View style={[styles.links, { borderTopColor: BORDER }]}>
          {links.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              onPress={() => open(item)}
              style={[styles.link, { borderBottomColor: BORDER }]}
            >
              <Text style={[styles.linkText, { color: colors.text }]}>{item.title}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.text} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// A menu item as a 4:5 picture with its name: the collection's picture, else its first
// product's.
function Tile({
  item,
  width,
  onPress,
}: {
  item: ShopMenuItemData;
  width: number;
  onPress: () => void;
}) {
  const { colors } = useSettings().theme;
  const picture =
    item.resource?.image?.url ?? item.resource?.products?.nodes[0]?.featuredImage?.url;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={{ width }}
    >
      <View style={[styles.tileImage, { height: width * 1.25 }]}>
        {picture ? (
          <Image
            source={imageUrl(picture, width * 2)}
            contentFit="cover"
            transition={200}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
      <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={2}>
        {item.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  retry: { fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  content: { paddingBottom: space.xxl },
  chips: { paddingHorizontal: gutter, paddingVertical: space.lg, gap: space.sm },
  chip: { borderWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.sm },
  chipText: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingHorizontal: gutter },
  tileImage: { backgroundColor: "#F5F3EF", overflow: "hidden" },
  tileLabel: {
    marginVertical: space.sm,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  links: {
    marginTop: space.xl,
    marginHorizontal: gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  link: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: 15 },
});
