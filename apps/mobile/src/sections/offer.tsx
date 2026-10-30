import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { z } from "zod";
import { withoutCodeStart } from "@appsy/app-config";
import type { offer } from "@appsy/sections/manifests";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { useCartActions, useCodeStart } from "@/lib/cart";
import { isPreview } from "@/lib/settings";

type Settings = z.output<typeof offer.settings>;

// A coupon card with the merchant's discount code. "Apply to bag" adds the code to the
// shopper's bag, where Shopify works out the discount; a press and hold copies the code.
// An app-only code shows without the store's code start, whichever way the merchant typed it.
export function Offer({ settings }: { settings: Settings }) {
  const { colors, buttons } = useSettings().theme;
  const { applyCode } = useCartActions();
  const codeStart = useCodeStart();
  const [message, setMessage] = useState<string | null>(null);
  const code = withoutCodeStart(settings.code.trim(), codeStart);
  if (!code) return <PreviewNote text="Add the discount code this offer shows." />;

  const filled = settings.style === "filled";
  const ink = filled ? colors.background : colors.text;
  const radius = buttons.shape === "pill" ? 999 : buttons.shape === "rounded" ? 8 : 0;

  const apply = () => {
    // The editor's phone doesn't change anyone's bag.
    if (isPreview) {
      setMessage("In your app, this adds the code to the shopper's bag.");
      return;
    }
    setMessage(null);
    applyCode.mutate(
      { code, keep: true },
      {
        onSuccess: ({ applicable }) =>
          setMessage(
            applicable
              ? "Added to your bag. The discount shows there and at checkout."
              : "Added to your bag. It applies once your bag qualifies.",
          ),
        onError: (error) => setMessage(error.message),
      },
    );
  };

  return (
    <View style={styles.section}>
      <View
        style={[
          styles.card,
          { borderRadius: radius === 999 ? 16 : radius },
          filled ? { backgroundColor: colors.brand } : { borderWidth: 1, borderColor: colors.brand },
        ]}
      >
        {settings.heading ? (
          <Text accessibilityRole="header" style={[styles.heading, { color: ink }]}>
            {settings.heading}
          </Text>
        ) : null}
        {settings.text ? <Text style={[styles.text, { color: ink }]}>{settings.text}</Text> : null}
        <View style={[styles.code, { borderColor: ink }]}>
          <Text selectable style={[styles.codeText, { color: ink }]}>
            {code}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply code ${code} to your bag`}
          disabled={applyCode.isPending}
          onPress={apply}
          style={({ pressed }) => [
            styles.button,
            { borderRadius: radius, opacity: pressed ? 0.7 : 1 },
            filled ? { backgroundColor: colors.background } : { backgroundColor: colors.brand },
          ]}
        >
          {applyCode.isPending ? (
            <ActivityIndicator color={filled ? colors.brand : colors.background} />
          ) : (
            <Text style={[styles.buttonLabel, { color: filled ? colors.brand : colors.background }]}>
              Apply to bag
            </Text>
          )}
        </Pressable>
        {message ? <Text style={[styles.message, { color: ink }]}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xxl, paddingHorizontal: gutter },
  card: { alignItems: "center", gap: space.md, padding: space.xl },
  heading: { fontSize: 16, fontWeight: "600", letterSpacing: 1.4, textTransform: "uppercase", textAlign: "center" },
  text: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  code: { borderWidth: 1, borderStyle: "dashed", paddingHorizontal: space.xl, paddingVertical: space.sm },
  codeText: { fontSize: 18, fontWeight: "700", letterSpacing: 2 },
  button: { minWidth: 180, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  buttonLabel: { fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "500" },
  message: { fontSize: 13, textAlign: "center" },
});
