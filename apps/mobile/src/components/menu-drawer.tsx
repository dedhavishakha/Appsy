import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { BORDER, MenuDrawerContext, PRESSED, useMenuDrawer } from "@/lib/menu-drawer";
import { Sections } from "@/sections";
import { StoreLogo } from "./store-logo";
import { Text } from "./text";

// The web (the editor's preview) has no native animation driver.
const NATIVE_DRIVER = Platform.OS !== "web";

// Holds the side menu's state and draws it over every screen. Seeaash's drawer: a panel
// pinned to the left edge, the full height of the screen, sliding in over a dimmed page.
export function MenuDrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  // 0 = shut, 1 = open. Drives both the panel's slide and the backdrop's fade.
  const [progress] = useState(() => new Animated.Value(0));

  const animateTo = useCallback(
    (toValue: 0 | 1, done?: () => void) =>
      Animated.timing(progress, {
        toValue,
        duration: toValue ? 240 : 180,
        easing: toValue ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }).start(() => done?.()),
    [progress],
  );

  useEffect(() => {
    if (visible) animateTo(1);
  }, [visible, animateTo]);

  // Stable, so effects that use them don't run again each time the menu opens or shuts.
  const open = useCallback(() => setVisible(true), []);
  // The page opens as the panel goes, so the app moves once, straight to it.
  const close = useCallback(
    (after?: () => void) =>
      animateTo(0, () => {
        after?.();
        setVisible(false);
      }),
    [animateTo],
  );
  const hide = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(0);
    setVisible(false);
  }, [progress]);
  const controls = useMemo(
    () => ({ visible, open, close, hide }),
    [visible, open, close, hide],
  );

  return (
    <MenuDrawerContext.Provider value={controls}>
      {children}
      <MenuDrawer progress={progress} />
    </MenuDrawerContext.Provider>
  );
}

function MenuDrawer({ progress }: { progress: Animated.Value }) {
  const settings = useSettings();
  const { visible, close } = useMenuDrawer();
  const { colors } = settings.theme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 380);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close()}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.fill} onPress={() => close()} accessibilityLabel="Close menu" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top,
              backgroundColor: colors.background,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-panelWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <DrawerHeader />
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
            <Sections sections={settings.pages.menu.sections} />
            {/* Always here, whatever the merchant designs: the consent prompt points to it. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => close(() => router.push("/privacy"))}
              style={({ pressed }) => [styles.privacy, pressed && { backgroundColor: PRESSED }]}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
              <Text style={[styles.privacyText, { color: colors.text }]}>Privacy choices</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// The store's logo, or its name until it has one, and the close button.
function DrawerHeader() {
  const { colors } = useSettings().theme;
  const { close } = useMenuDrawer();

  return (
    <View style={[styles.header, { borderBottomColor: BORDER }]}>
      <View style={styles.logo}>
        <StoreLogo height={32} align="left" />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        hitSlop={8}
        onPress={() => close()}
        style={styles.close}
      >
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

// The ☰ button in the header.
export function MenuButton() {
  const { colors } = useSettings().theme;
  const { open } = useMenuDrawer();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Menu"
      hitSlop={8}
      onPress={open}
      style={styles.menuButton}
    >
      <Ionicons name="menu-outline" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingLeft: gutter,
    paddingRight: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: { flex: 1, minWidth: 0 },
  close: { padding: space.sm },
  menuButton: { padding: 6 },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.lg,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
  },
  privacyText: { fontSize: 13, opacity: 0.8 },
});
