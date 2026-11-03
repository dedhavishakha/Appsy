import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER, PRESSED } from "@/lib/menu-drawer";
import { Button } from "./button";
import { Text, TextInput } from "./text";

// What the Account tab's screens share: rows, form fields, and what shows while loading, on
// a problem, with nothing to list, or once the shopper has signed out.

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Centred({ children }: { children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.centred, { backgroundColor: colors.background }]}>
      {children ?? <ActivityIndicator />}
    </View>
  );
}

export function Note({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  const colors = useColors();
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={36} color={colors.text} />
      <Text accessibilityRole="header" style={[styles.noteTitle, { color: colors.text }]}>
        {title}
      </Text>
      {text ? <Text style={[styles.noteText, { color: colors.text }]}>{text}</Text> : null}
    </View>
  );
}

export function Problem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Centred>
      <Note
        icon="cloud-offline-outline"
        title="This didn't load"
        text={error instanceof Error ? error.message : undefined}
      />
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </Centred>
  );
}

// A screen of the account the shopper is no longer signed in to.
export function SignedOutNote() {
  return (
    <Centred>
      <Note icon="person-circle-outline" title="You're signed out" />
      <Button title="Sign in" onPress={() => router.navigate("/account")} />
    </Centred>
  );
}

export function Row({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: PRESSED }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.text} />
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={`${colors.text}80`}
        {...input}
        style={[styles.input, { color: colors.text }]}
      />
      {hint ? <Text style={[styles.hint, { color: colors.text }]}>{hint}</Text> : null}
    </View>
  );
}

export const accountStyles = StyleSheet.create({
  error: { color: "#B42318", fontSize: 13 },
});

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
    gap: space.md,
  },
  note: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  noteTitle: { fontSize: 18, textAlign: "center" },
  noteText: { fontSize: 14, textAlign: "center", opacity: 0.75 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowLabel: { flex: 1, fontSize: 15 },
  field: { gap: space.xs },
  label: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
  hint: { fontSize: 12, opacity: 0.65 },
});
