import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";
import { Text } from "./text";

// Seeaash's bottom sheet on the platform's Modal: sort, filters and pickers.
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: footer ? 0 : insets.bottom + space.md },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.side} />
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={styles.side}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.4)" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: "85%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  side: { width: 44, alignItems: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "600" },
  body: { flexShrink: 1 },
  footer: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
});
