import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ga4BeginCheckout, ga4Purchase, withoutCodeStart } from "@appsy/app-config";
import { Button } from "@/components/button";
import { Text, TextInput } from "@/components/text";
import { ga4Line, useAnalytics } from "@/lib/analytics";
import { gutter, space, useColors } from "@/lib/app-settings";
import { CART_KEY, useCart, useCartActions, useCodeStart } from "@/lib/cart";
import { openCheckout } from "@/lib/checkout";
import { useMoney } from "@/lib/currency";
import { formatMoney, imageUrl, type Money } from "@/lib/format";
import { BORDER } from "@/lib/menu-drawer";
import { usePush } from "@/lib/push";
import type { Cart, CartLine } from "@/lib/queries";

// The bag, and the way to Shopify's checkout with its items already loaded (rule 5.7.14).
// Shopify works out every discount: automatic ones from the store's Discounts page, and
// codes the shopper adds here or at checkout.
export default function CartScreen() {
  const colors = useColors();
  const money = useMoney();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: cart, isLoading } = useCart();
  const { setQuantity } = useCartActions();
  const codeStart = useCodeStart();
  const { track, trackGa4 } = useAnalytics();
  const { orderPlaced } = usePush();
  const [opening, setOpening] = useState(false);

  // Shopify's own checkout, with Checkout Kit in phone builds and the in-app browser
  // elsewhere (lib/checkout). Google Analytics gets the bag as it goes to checkout, and the
  // order when Checkout Kit says one was placed.
  const checkout = async () => {
    if (!cart) return;
    track("checkout_started", { items: cart.totalQuantity });
    const currency = cart.cost.totalAmount.currencyCode;
    const items = cart.lines.nodes.map(ga4Line);
    const code = cart.discountCodes.find((entry) => entry.applicable)?.code;
    const coupon = code ? withoutCodeStart(code, codeStart) : undefined;
    trackGa4(ga4BeginCheckout(currency, items, coupon));
    setOpening(true);
    try {
      await openCheckout(cart, (order) => {
        // The bag was bought, so its reminder goes.
        orderPlaced();
        trackGa4(
          ga4Purchase({
            orderId: order.id,
            currency,
            items,
            coupon,
            tax: order.tax,
            shipping: order.shipping,
          }),
        );
      });
    } finally {
      setOpening(false);
      // After an order, Shopify ends the cart, so refetching empties the bag.
      await queryClient.invalidateQueries({ queryKey: CART_KEY });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!cart || cart.totalQuantity === 0) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <Text style={[styles.empty, { color: colors.text }]}>Your bag is empty.</Text>
      </View>
    );
  }

  const discounts = discountTotals(cart, codeStart);
  const charged = cart.cost.totalAmount;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={cart.lines.nodes}
        keyExtractor={(line) => line.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Line
            line={item}
            busy={setQuantity.isPending}
            onChange={(quantity) => setQuantity.mutate({ lineId: item.id, quantity })}
          />
        )}
        ListFooterComponent={<DiscountCodes cart={cart} />}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {setQuantity.error && <Text style={styles.error}>{setQuantity.error.message}</Text>}
        {discounts.rows.length > 0 ? (
          <>
            <SummaryRow label="Items" value={money.format(discounts.before)} />
            {discounts.rows.map((row) => (
              <SummaryRow
                key={row.label}
                label={row.label}
                value={`−${money.format(row.amount)}`}
                color={colors.accent}
              />
            ))}
            <SummaryRow label="Total" value={money.format(cart.cost.totalAmount)} strong />
          </>
        ) : (
          <SummaryRow label="Subtotal" value={money.format(cart.cost.subtotalAmount)} strong />
        )}
        <Text style={[styles.note, { color: colors.text }]}>
          Shipping and taxes are calculated at checkout.
        </Text>
        {/* Converted prices are for reference: checkout charges the market's currency. */}
        {money.converts(charged.currencyCode) && (
          <Text style={[styles.note, { color: colors.text }]}>
            Prices are converted for display. At checkout you pay {formatMoney(charged)} in{" "}
            {charged.currencyCode}; your bank converts it.
          </Text>
        )}
        <Button title="Checkout" loading={opening} onPress={checkout} style={styles.checkout} />
      </View>
    </KeyboardAvoidingView>
  );
}

// The bag's discounts, each one added up across the lines it applies to, and the price of
// everything before any discount. App-only codes show without the store's code start.
function discountTotals(cart: Cart, codeStart: string | null) {
  const currencyCode = cart.cost.totalAmount.currencyCode;
  const sums = new Map<string, number>();
  let before = 0;
  for (const line of cart.lines.nodes) {
    before += Number(line.cost.subtotalAmount.amount);
    for (const allocation of line.discountAllocations) {
      const label = withoutCodeStart(allocation.title || allocation.code || "Discount", codeStart);
      sums.set(label, (sums.get(label) ?? 0) + Number(allocation.discountedAmount.amount));
    }
  }
  const money = (amount: number): Money => ({ amount: String(amount), currencyCode });
  return {
    before: money(before),
    rows: [...sums]
      .filter(([, amount]) => amount > 0)
      .map(([label, amount]) => ({ label, amount: money(amount) })),
  };
}

function SummaryRow({
  label,
  value,
  color,
  strong = false,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  const colors = useColors();
  const textColor = color ?? colors.text;
  return (
    <View style={styles.summaryRow}>
      <Text style={[strong ? styles.summaryStrongLabel : styles.summaryLabel, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[strong ? styles.summaryStrongValue : styles.summaryValue, { color: textColor }]}>
        {value}
      </Text>
    </View>
  );
}

// The shopper's discount codes, as in Seeaash. Codes that don't apply to the bag yet (say,
// one added from an offer before the bag qualifies) are marked, not hidden.
function DiscountCodes({ cart }: { cart: Cart }) {
  const colors = useColors();
  const { applyCode, removeCode } = useCartActions();
  const codeStart = useCodeStart();
  const [code, setCode] = useState("");

  return (
    <View style={styles.codes}>
      <Text style={[styles.codesTitle, { color: colors.text }]}>Discount code</Text>
      <View style={styles.codeRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Enter code"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Discount code"
          onSubmitEditing={() => code.trim() && applyCode.mutate({ code }, { onSuccess: () => setCode("") })}
          style={[styles.codeInput, { color: colors.text }]}
        />
        <Button
          title="Apply"
          variant="secondary"
          loading={applyCode.isPending}
          disabled={!code.trim()}
          onPress={() => applyCode.mutate({ code }, { onSuccess: () => setCode("") })}
          style={styles.applyButton}
        />
      </View>
      {applyCode.error && <Text style={styles.error}>{applyCode.error.message}</Text>}
      {cart.discountCodes.map((entry) => (
        <View key={entry.code} style={styles.appliedCode}>
          <Ionicons name="pricetag-outline" size={14} color={colors.text} />
          <Text style={[styles.appliedText, { color: colors.text }]}>
            {withoutCodeStart(entry.code, codeStart)}
            {entry.applicable ? "" : " · applies once your bag qualifies"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${withoutCodeStart(entry.code, codeStart)}`}
            disabled={removeCode.isPending}
            onPress={() => removeCode.mutate(entry.code)}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Line({
  line,
  busy,
  onChange,
}: {
  line: CartLine;
  busy: boolean;
  onChange: (quantity: number) => void;
}) {
  const colors = useColors();
  const money = useMoney();
  const { merchandise } = line;
  // The line's own (product) discount, shown as the price before it, struck through.
  const discounted = Number(line.cost.subtotalAmount.amount) > Number(line.cost.totalAmount.amount);
  return (
    <View style={styles.line}>
      <Image
        source={imageUrl(merchandise.image?.url, 160)}
        alt={merchandise.image?.altText ?? merchandise.product.title}
        contentFit="cover"
        style={styles.thumb}
      />
      <View style={styles.lineInfo}>
        <Text style={[styles.lineTitle, { color: colors.text }]} numberOfLines={2}>
          {merchandise.product.title}
        </Text>
        {merchandise.title !== "Default Title" && (
          <Text style={[styles.variant, { color: colors.text }]}>{merchandise.title}</Text>
        )}
        <View style={styles.linePrices}>
          <Text style={[styles.lineTotal, { color: discounted ? colors.accent : colors.text }]}>
            {money.format(line.cost.totalAmount)}
          </Text>
          {discounted && (
            <Text style={[styles.strike, { color: colors.text }]}>{money.format(line.cost.subtotalAmount)}</Text>
          )}
        </View>
        <View style={styles.stepper}>
          <Stepper label="−" accessibilityLabel="Remove one" disabled={busy} onPress={() => onChange(line.quantity - 1)} />
          <Text style={[styles.quantity, { color: colors.text }]}>{line.quantity}</Text>
          <Stepper label="+" accessibilityLabel="Add one" disabled={busy} onPress={() => onChange(line.quantity + 1)} />
        </View>
      </View>
    </View>
  );
}

function Stepper({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.stepperButton, { borderColor: "#D4D4D4", opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 15 },
  list: { padding: gutter },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "#E3E3E3", marginVertical: space.md },
  line: { flexDirection: "row", gap: space.md },
  thumb: { width: 80, height: 106, backgroundColor: "#F5F3EF" },
  lineInfo: { flex: 1, gap: space.xs },
  lineTitle: { fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase" },
  variant: { fontSize: 12, opacity: 0.7 },
  linePrices: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  lineTotal: { fontSize: 13, fontWeight: "500" },
  strike: { fontSize: 12, opacity: 0.55, textDecorationLine: "line-through" },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  stepperButton: { width: 32, height: 32, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  quantity: { minWidth: 20, textAlign: "center" },
  codes: { marginTop: space.xl, gap: space.sm },
  codesTitle: { fontSize: 13, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  codeInput: { flex: 1, height: 46, borderWidth: 1, borderColor: BORDER, paddingHorizontal: space.md, fontSize: 14 },
  applyButton: { marginTop: 0, minWidth: 96 },
  appliedCode: { flexDirection: "row", alignItems: "center", gap: space.sm },
  appliedText: { flex: 1, fontSize: 13 },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E3E3E3",
    gap: space.xs,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  summaryLabel: { flexShrink: 1, fontSize: 13 },
  summaryValue: { fontSize: 13 },
  summaryStrongLabel: { flexShrink: 1, fontSize: 14, letterSpacing: 1, textTransform: "uppercase" },
  summaryStrongValue: { fontSize: 15, fontWeight: "600" },
  note: { fontSize: 12, opacity: 0.65 },
  checkout: { alignSelf: "stretch" },
  error: { color: "#B3261E", textAlign: "center" },
});
