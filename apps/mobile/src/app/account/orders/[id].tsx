import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ScrollView, StyleSheet, View } from "react-native";
import { Centred, Note, Problem, SignedOutNote } from "@/components/account-ui";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { formatDate, orderStatus, useOrder } from "@/lib/account-data";
import { gutter, space, useColors } from "@/lib/app-settings";
import { formatMoney, imageUrl, type Money } from "@/lib/format";
import { BORDER } from "@/lib/menu-drawer";

// One order: where it is, tracking for each shipment, what was bought, the totals, where it's
// going, and Shopify's order status page.
export default function OrderScreen() {
  const colors = useColors();
  const { status } = useAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, error, refetch } = useOrder(typeof id === "string" ? id : "");

  if (status !== "signedIn") return <SignedOutNote />;
  if (isLoading) return <Centred />;
  if (error) return <Problem error={error} onRetry={() => void refetch()} />;
  if (!order) {
    return (
      <Centred>
        <Note icon="receipt-outline" title="This order wasn't found" />
      </Centred>
    );
  }

  const tracking = order.fulfillments.nodes
    .flatMap((fulfillment) => fulfillment.trackingInformation)
    .filter((entry) => entry.url || entry.number);
  const open = (url: string) => void WebBrowser.openBrowserAsync(url);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: `Order ${order.name}` }} />
      <View style={styles.header}>
        <Text style={[styles.placed, { color: colors.text }]}>
          Placed {formatDate(order.processedAt)}
        </Text>
        <Text accessibilityRole="header" style={[styles.status, { color: colors.brand }]}>
          {orderStatus(order)}
        </Text>
      </View>

      {tracking.map((entry, index) => (
        <View key={`${entry.number ?? ""}-${index}`} style={styles.tracking}>
          <Text style={[styles.trackingText, { color: colors.text }]}>
            {entry.company ?? "Shipment"}
            {entry.number ? ` · ${entry.number}` : ""}
          </Text>
          {entry.url ? (
            <Button
              title="Track"
              variant="secondary"
              onPress={() => entry.url && open(entry.url)}
              style={styles.track}
            />
          ) : null}
        </View>
      ))}

      <View style={styles.section}>
        {order.lineItems.nodes.map((line) => (
          <View key={line.id} style={styles.line}>
            <Image
              source={imageUrl(line.image?.url, 160)}
              alt={line.image?.altText ?? line.title}
              contentFit="cover"
              style={styles.thumb}
            />
            <View style={styles.lineInfo}>
              <Text style={[styles.lineTitle, { color: colors.text }]}>{line.title}</Text>
              {line.variantTitle ? (
                <Text style={[styles.small, { color: colors.text }]}>{line.variantTitle}</Text>
              ) : null}
              <Text style={[styles.small, { color: colors.text }]}>Quantity {line.quantity}</Text>
            </View>
            {line.totalPrice ? (
              <Text style={[styles.lineTitle, { color: colors.text }]}>
                {formatMoney(line.totalPrice)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={[styles.summary, { borderColor: BORDER }]}>
        {order.subtotal ? <Sum label="Subtotal" money={order.subtotal} /> : null}
        <Sum
          label="Shipping"
          money={order.totalShipping}
          free={Number(order.totalShipping.amount) === 0}
        />
        {order.totalTax && Number(order.totalTax.amount) > 0 ? (
          <Sum label="Taxes" money={order.totalTax} />
        ) : null}
        <Sum label="Total" money={order.totalPrice} strong />
      </View>

      {order.shippingAddress ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            Shipping to
          </Text>
          {order.shippingAddress.formatted.map((line, index) => (
            <Text key={`${line}-${index}`} style={[styles.small, { color: colors.text }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <Button
        title="Order status page"
        variant="secondary"
        onPress={() => open(order.statusPageUrl)}
        style={styles.wide}
      />
    </ScrollView>
  );
}

function Sum({
  label,
  money,
  free = false,
  strong = false,
}: {
  label: string;
  money: Money;
  free?: boolean;
  strong?: boolean;
}) {
  const colors = useColors();
  const style = [strong ? styles.strong : styles.small, { color: colors.text }];
  return (
    <View style={styles.sum}>
      <Text style={style}>{label}</Text>
      <Text style={style}>{free ? "Free" : formatMoney(money)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  header: { padding: gutter, paddingTop: space.xl, gap: space.xs, alignItems: "center" },
  placed: { fontSize: 13, opacity: 0.75 },
  status: { fontSize: 20, textAlign: "center" },
  tracking: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  trackingText: { flex: 1, fontSize: 14 },
  track: { marginTop: 0, minWidth: 96 },
  section: { paddingHorizontal: gutter, paddingTop: space.xl, gap: space.sm },
  heading: { fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  line: { flexDirection: "row", gap: space.md, alignItems: "center" },
  thumb: { width: 56, height: 74, backgroundColor: "#F5F3EF" },
  lineInfo: { flex: 1, gap: 2 },
  lineTitle: { fontSize: 14 },
  small: { fontSize: 13, opacity: 0.8 },
  strong: { fontSize: 15, fontWeight: "600" },
  summary: {
    margin: gutter,
    marginTop: space.xl,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
  },
  sum: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  wide: { alignSelf: "stretch", marginHorizontal: gutter, marginTop: space.xl },
});
