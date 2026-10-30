import { focusManager, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { router, Stack, usePathname, useRootNavigationState, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from "react-native";
import { publishedSettingsSchema, type PublishedSettings } from "@appsy/app-config";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { BagButton } from "@/components/bag-button";
import { CountryProvider } from "@/components/country-provider";
import { CurrencyProvider } from "@/components/currency-provider";
import { MenuDrawerProvider } from "@/components/menu-drawer";
import { PushProvider } from "@/components/push-provider";
import { Text } from "@/components/text";
import { WishlistProvider } from "@/components/wishlist-provider";
import { SettingsContext } from "@/lib/app-settings";
import { TypographyContext, useDesignTypography } from "@/lib/fonts";
import { useMenuDrawer } from "@/lib/menu-drawer";
import { fetchSettings, isPreview, loadKeptSettings } from "@/lib/settings";

// Screens that slide up over the app (the bag, country, currency, privacy), without the bag
// button.
const modal = (title: string) => ({
  title,
  presentation: "modal" as const,
  headerRight: () => null,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

// The splash screen (the merchant's colour and picture, app.config.js) stays up until the
// design is ready, rather than giving way to a spinner; never longer than this, so a slow
// network still reaches the app's own message.
const SPLASH_LIMIT_MS = 8000;
if (Platform.OS !== "web") void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <DesignGate />
    </QueryClientProvider>
  );
}

// Loads the design before any screen draws: the published one, or in the editor's phone
// frame, the unsaved one the editor sends. The app starts with the design kept on the phone
// and switches to a newer one once it's downloaded, so it opens even when Appsy can't be
// reached (doc 01: shopping doesn't depend on Appsy's servers).
function DesignGate() {
  const preview = usePreviewDesign();
  const kept = useKeptSettings();
  const published = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    enabled: !isPreview,
  });
  useRefreshOnReturn();
  const settings = isPreview ? preview.settings : (published.data ?? kept.settings);
  const typography = useDesignTypography(settings?.theme.fonts ?? null);
  // An error only when there's no design at all: no download and nothing kept.
  const failed = !settings && !isPreview && kept.checked && !published.isLoading;
  useHideSplash(Boolean(settings) || failed);

  if (!settings) {
    // A preview built from older code than the editor's (docs/04, section 5a).
    if (isPreview && preview.unreadable) {
      return (
        <View style={styles.centred}>
          <Text style={styles.message}>
            This preview is older than the editor. In the Appsy folder, run npm run
            preview:build, then open the editor again.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.centred}>
        {failed ? (
          <>
            <Text style={styles.message}>
              {published.error instanceof Error
                ? published.error.message
                : "The app couldn't load."}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => published.refetch()}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const { colors } = settings.theme;
  return (
    <SettingsContext.Provider value={settings}>
      <TypographyContext.Provider value={typography}>
        <AnalyticsProvider>
          <CountryProvider>
            <CurrencyProvider>
              <WishlistProvider>
                <PushProvider>
                  <MenuDrawerProvider>
                    <Stack
                      screenOptions={{
                        headerShadowVisible: false,
                        headerTitleAlign: "center",
                        headerTintColor: colors.text,
                        // Titles such as "Your bag" in the heading font, once it's loaded.
                        headerTitleStyle: typography.heading
                          ? { fontFamily: typography.heading.bold }
                          : undefined,
                        headerStyle: { backgroundColor: colors.background },
                        contentStyle: { backgroundColor: colors.background },
                        headerRight: () => <BagButton />,
                      }}
                    >
                      {/* Home, Shop, Search and Wishlist, with the tab bar (app/(tabs)). */}
                      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
                      <Stack.Screen name="collections/[handle]" options={{ title: "" }} />
                      <Stack.Screen name="products/[handle]" options={{ title: "" }} />
                      <Stack.Screen name="cart" options={modal("Your bag")} />
                      <Stack.Screen name="country" options={modal("Country or region")} />
                      <Stack.Screen name="currency" options={modal("Currency")} />
                      <Stack.Screen name="privacy" options={modal("Privacy choices")} />
                      <Stack.Screen name="licences" options={modal("Open-source licences")} />
                      <Stack.Screen name="size-chart" options={modal("Size chart")} />
                    </Stack>
                    {isPreview && <PreviewNavigator request={preview.navigation} />}
                  </MenuDrawerProvider>
                </PushProvider>
              </WishlistProvider>
            </CurrencyProvider>
          </CountryProvider>
        </AnalyticsProvider>
      </TypographyContext.Provider>
      <StatusBar style="dark" />
    </SettingsContext.Provider>
  );
}

// The design kept on the phone (lib/settings.ts), read once at start. Not used in the
// editor's preview, which always draws the editor's design.
function useKeptSettings() {
  const [kept, setKept] = useState<{ checked: boolean; settings: PublishedSettings | null }>({
    checked: isPreview,
    settings: null,
  });
  useEffect(() => {
    if (isPreview) return;
    let current = true;
    void loadKeptSettings().then((settings) => current && setKept({ checked: true, settings }));
    return () => {
      current = false;
    };
  }, []);
  return kept;
}

// Hides the splash screen once there's something to show (the design, or the message that
// it couldn't load), or after SPLASH_LIMIT_MS. Native only: the web preview has none.
function useHideSplash(ready: boolean) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (ready) {
      SplashScreen.hide();
      return;
    }
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [ready]);
}

// When the shopper comes back to the app, data older than a minute reloads: a newly
// published design, prices, the bag (TanStack Query's React Native setup).
function useRefreshOnReturn() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active"),
    );
    return () => subscription.remove();
  }, []);
}

// The editor's messages to its phone frame (apps/admin/app/routes/editor.tsx): the design,
// shaped like a published settings file, and the page to show.
type EditorMessage =
  | { source: "appsy-editor"; type: "design"; settings: unknown }
  | { source: "appsy-editor"; type: "navigate"; path: string };

type NavigationRequest = { path: string; id: number };

// Only the pages the editor designs: Home, a product, a collection, or the side menu.
const PREVIEW_PATH = /^\/((products|collections)\/[^/?#]+|menu)?$/;

// Not a screen of its own: Home with the side menu open.
const MENU_PATH = "/menu";

// Preview mode only: listens to the editor that framed this page (same origin, parent
// window) and tells it when it's ready for the design.
function usePreviewDesign() {
  const [settings, setSettings] = useState<PublishedSettings | null>(null);
  const [navigation, setNavigation] = useState<NavigationRequest | null>(null);
  // A design came that this build can't read.
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!isPreview) return;
    let requests = 0;
    let designed = false;
    const ready = () =>
      window.parent.postMessage({ source: "appsy-preview", type: "ready" }, window.location.origin);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = event.data as Partial<EditorMessage> | null;
      if (message?.source !== "appsy-editor") return;
      if (message.type === "design") {
        const parsed = publishedSettingsSchema.safeParse(message.settings);
        designed = true;
        setUnreadable(!parsed.success);
        if (parsed.success) setSettings(parsed.data);
      } else if (message.type === "navigate" && PREVIEW_PATH.test(String(message.path))) {
        requests += 1;
        setNavigation({ path: String(message.path), id: requests });
      }
    };
    window.addEventListener("message", onMessage);
    ready();
    // Says it again until a design arrives, in case the editor wasn't listening yet.
    const retry = setInterval(() => (designed ? clearInterval(retry) : ready()), 1000);
    return () => {
      clearInterval(retry);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return { settings, navigation, unreadable };
}

// Opens the page the editor asks for, once the navigator is ready, and reports each page
// the preview shows, so the editor follows when the merchant taps around in it.
function PreviewNavigator({ request }: { request: NavigationRequest | null }) {
  const navigation = useRootNavigationState();
  const pathname = usePathname();
  const drawer = useMenuDrawer();
  const ready = Boolean(navigation?.key);
  const { open, hide } = drawer;
  useEffect(() => {
    if (!ready || !request) return;
    if (request.path === MENU_PATH) {
      router.replace("/");
      open();
    } else {
      hide();
      router.replace(request.path as Href);
    }
  }, [ready, request, open, hide]);
  const location = drawer.visible ? MENU_PATH : pathname;
  useEffect(() => {
    if (!ready) return;
    window.parent.postMessage(
      { source: "appsy-preview", type: "location", path: location },
      window.location.origin,
    );
  }, [ready, location]);
  return null;
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  message: { textAlign: "center", fontSize: 15 },
  retry: { fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
});
