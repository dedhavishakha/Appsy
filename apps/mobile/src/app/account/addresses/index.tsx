import { router } from "expo-router";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import {
  accountStyles,
  Centred,
  Note,
  Problem,
  SignedOutNote,
} from "@/components/account-ui";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { useAddressActions, useAddresses } from "@/lib/account-data";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";

// The shopper's saved addresses: change one, make it the default, or delete it. There's no
// adding here: a new address needs its country's regions (states, provinces), and Shopify's
// APIs give the app no list of them, so a typed region could be refused.
export default function AddressesScreen() {
  const colors = useColors();
  const { status } = useAccount();
  const { data, isLoading, error, refetch, isRefetching } = useAddresses();
  const { update, remove } = useAddressActions();

  if (status !== "signedIn") return <SignedOutNote />;
  if (isLoading) return <Centred />;
  if (error || !data) return <Problem error={error} onRetry={() => void refetch()} />;

  const confirmDelete = (id: string) =>
    Alert.alert("Delete this address?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(id) },
    ]);
  const busy = update.isPending || remove.isPending;
  const problem = update.error ?? remove.error;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={data.addresses}
      keyExtractor={(address) => address.id}
      contentContainerStyle={styles.list}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      ListHeaderComponent={
        problem ? <Text style={accountStyles.error}>{problem.message}</Text> : null
      }
      ListEmptyComponent={<Note icon="location-outline" title="No saved addresses" />}
      renderItem={({ item }) => {
        const isDefault = item.id === data.defaultId;
        return (
          <View style={[styles.card, { borderColor: BORDER }]}>
            {isDefault ? (
              <Text style={[styles.default, { color: colors.brand }]}>Default address</Text>
            ) : null}
            {item.formatted.map((line, index) => (
              <Text key={`${line}-${index}`} style={[styles.line, { color: colors.text }]}>
                {line}
              </Text>
            ))}
            {item.phoneNumber ? (
              <Text style={[styles.line, { color: colors.text }]}>{item.phoneNumber}</Text>
            ) : null}
            <View style={styles.actions}>
              <Action
                label="Edit"
                disabled={busy}
                onPress={() =>
                  router.push({ pathname: "/account/addresses/edit", params: { id: item.id } })
                }
              />
              {!isDefault ? (
                <Action
                  label="Make default"
                  disabled={busy}
                  onPress={() => update.mutate({ id: item.id, isDefault: true })}
                />
              ) : null}
              <Action label="Delete" disabled={busy} onPress={() => confirmDelete(item.id)} />
            </View>
          </View>
        );
      }}
    />
  );
}

function Action({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, { color: colors.text, opacity: disabled ? 0.5 : 1 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: gutter, gap: space.md, flexGrow: 1 },
  card: { borderWidth: 1, padding: space.lg, gap: 2 },
  default: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: space.xs },
  line: { fontSize: 14 },
  actions: { flexDirection: "row", gap: space.xl, marginTop: space.md },
  action: { fontSize: 13, textDecorationLine: "underline" },
});
