import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Centred, Note, Problem, SignedOutNote } from "@/components/account-ui";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { formatDate, orderStatus, useOrders } from "@/lib/account-data";
import type { OrderSummary } from "@/lib/account-queries";
import { gutter, space, useColors } from "@/lib/app-settings";
import { formatMoney, imageUrl } from "@/lib/format";
import { BORDER, PRESSED } from "@/lib/menu-drawer";

// The shopper's orders, newest first, a page at a time. Totals are what was charged, in the
// order's own currency.
export default function OrdersScreen() {
  const colors = useColors();
  const { status } = useAccount();
  const orders = useOrders();
  const list = orders.data?.pages.flatMap((page) => page.nodes) ?? [];

  if (status !== "signedIn") return <SignedOutNote />;
  if (orders.isLoading) return <Centred />;
  if (orders.error && list.length === 0) {
    return <Problem error={orders.error} onRetry={() => void orders.refetch()} />;
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={list}
      keyExtractor={(order) => order.id}
      refreshing={orders.isRefetching && !orders.isFetchingNextPage}
      onRefresh={() => void orders.refetch()}
      onEndReached={() => {
        if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
      }}
      ListEmptyComponent={<Note icon="receipt-outline" title="No orders yet" />}
      ListFooterComponent={
        orders.isFetchingNextPage ? <ActivityIndicator style={styles.more} /> : null
      }
      renderItem={({ item }) => <OrderRow order={item} />}
    />
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/account/orders/[id]", params: { id: order.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: PRESSED }]}
    >
      <View style={styles.images}>
        {order.lineItems.nodes.slice(0, 2).map((line) => (
          <Image
            key={line.id}
            source={imageUrl(line.image?.url, 120)}
            alt={line.image?.altText ?? line.title}
            contentFit="cover"
            style={styles.thumb}
          />
        ))}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]}>Order {order.name}</Text>
        <Text style={[styles.detail, { color: colors.text }]}>
          {formatDate(order.processedAt)} · {formatMoney(order.totalPrice)}
        </Text>
        <Text style={[styles.status, { color: colors.brand }]}>{orderStatus(order)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  images: { flexDirection: "row", gap: space.xs },
  thumb: { width: 44, height: 58, backgroundColor: "#F5F3EF" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "600" },
  detail: { fontSize: 13, opacity: 0.75 },
  status: { fontSize: 13, fontWeight: "600" },
  more: { padding: space.lg },
});
