import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { BagButton } from "@/components/bag-button";
import { HeaderItems } from "@/components/header-items";
import { StoreLogo } from "@/components/store-logo";
import { useSettings } from "@/lib/app-settings";
import { useTypography } from "@/lib/fonts";
import { BORDER } from "@/lib/menu-drawer";
import { useWishlist, useWishlistEnabled } from "@/lib/wishlist";

type IconName = ComponentProps<typeof Ionicons>["name"];

// The tabs the design can list (navigation.tabs), each with its screen in this folder. The
// Account tab arrives with shopper sign-in; phones skip tabs they don't have.
const TABS: Record<string, { screen: string; title: string; icon: IconName; active: IconName }> = {
  home: { screen: "index", title: "Home", icon: "home-outline", active: "home" },
  shop: { screen: "shop", title: "Shop", icon: "grid-outline", active: "grid" },
  search: { screen: "search", title: "Search", icon: "search-outline", active: "search" },
  wishlist: { screen: "wishlist", title: "Wishlist", icon: "heart-outline", active: "heart" },
};

// Seeaash's tab bar, in the design's order and the merchant's colours and fonts. A tab that
// isn't listed (or whose feature is off) is hidden, but its screen still opens from links.
// With one tab, there's no bar.
export default function TabsLayout() {
  const settings = useSettings();
  const { colors } = settings.theme;
  const { header } = settings.navigation;
  const typography = useTypography();
  const wishlistOn = useWishlistEnabled();
  const saved = useWishlist().items.length;

  const shown = settings.navigation.tabs.filter(
    (id) => Object.hasOwn(TABS, id) && (id !== "wishlist" || wishlistOn),
  );
  const hidden = Object.keys(TABS).filter((id) => !shown.includes(id));

  // What one tab adds to the shared options.
  const optionsFor = (id: string) => {
    switch (id) {
      // Home's header: the store's logo, and the buttons the design puts on each side.
      case "home":
        return {
          headerTitle: () => <StoreLogo />,
          headerLeft: () => <HeaderItems ids={header.left} />,
          headerRight: () => <HeaderItems ids={header.right} />,
        };
      // Search draws its own search bar.
      case "search":
        return { headerShown: false };
      case "wishlist":
        return saved > 0
          ? {
              tabBarBadge: saved,
              tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.background },
            }
          : {};
      default:
        return {};
    }
  };

  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: "center",
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: typography.heading ? { fontFamily: typography.heading.bold } : undefined,
        headerRight: () => <BagButton />,
        tabBarActiveTintColor: colors.brand,
        // The theme's text colour, a little lighter (#RRGGBB plus alpha).
        tabBarInactiveTintColor: `${colors.text}99`,
        tabBarLabelStyle: typography.body
          ? { fontFamily: typography.body.regular, fontWeight: "normal" }
          : undefined,
        tabBarStyle:
          shown.length > 1
            ? { backgroundColor: colors.background, borderTopColor: BORDER }
            : { display: "none" },
      }}
    >
      {[...shown, ...hidden].map((id) => {
        const tab = TABS[id];
        if (!tab) return null;
        return (
          <Tabs.Screen
            key={id}
            name={tab.screen}
            options={{
              title: tab.title,
              href: shown.includes(id) ? undefined : null,
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={focused ? tab.active : tab.icon} size={size} color={color} />
              ),
              ...optionsFor(id),
            }}
          />
        );
      })}
    </Tabs>
  );
}
