import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ERASE_AFTER_DAYS, erasedBy } from "@appsy/app-config";
import { accountStyles, SignedOutNote } from "@/components/account-ui";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { formatDate } from "@/lib/account-data";
import { gutter, space, useSettings } from "@/lib/app-settings";
import { usePush } from "@/lib/push";

// Deleting the shopper's account, from the Account tab (Apple 5.1.1(v)): what Shopify erases
// and keeps, and how long it takes (app-config accounts.ts), then the request.
export default function DeleteAccountScreen() {
  const settings = useSettings();
  const { colors } = settings.theme;
  const account = useAccount();
  const { installId } = usePush();
  const store = settings.app?.name ?? "The store";
  const [problem, setProblem] = useState<string | null>(null);
  // Once the request is sent, the shopper is signed out and the phone remembers it.
  const asked = account.status === "signedIn" ? null : account.deletionRequestedAt;

  if (asked) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        <View style={styles.centred}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.text} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Request sent
          </Text>
        </View>
        <Text style={[styles.text, { color: colors.text }]}>
          {store} has asked Shopify to erase your account. Shopify does this by{" "}
          {formatDate(erasedBy(asked).toISOString())}. You&apos;re signed out on this phone.
        </Text>
        <Button title="Done" onPress={() => router.back()} style={styles.wide} />
      </ScrollView>
    );
  }
  if (account.status !== "signedIn") return <SignedOutNote />;

  const send = () => {
    setProblem(null);
    account
      .deleteAccount(installId)
      .catch((error: unknown) =>
        setProblem(
          error instanceof Error ? error.message : "Your request couldn't be sent.",
        ),
      );
  };
  const confirm = () =>
    Alert.alert("Delete your account?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: send },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.text, { color: colors.text }]}>
        {store} will ask Shopify to erase your account and your personal details, such as your
        name and addresses. Shopify does this {ERASE_AFTER_DAYS} days after your request.
      </Text>
      <Text style={[styles.text, { color: colors.text }]}>
        Records of what you bought, and when, stay with {store}. Subscriptions end, and payments
        still due on pre-orders aren&apos;t taken.
      </Text>
      <Text style={[styles.text, { color: colors.text }]}>
        You&apos;ll be signed out on this phone.
      </Text>
      {problem ? <Text style={accountStyles.error}>{problem}</Text> : null}
      <Button
        title="Delete my account"
        loading={account.busy}
        onPress={confirm}
        style={styles.wide}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: gutter, gap: space.lg, paddingBottom: space.xxl },
  centred: { alignItems: "center", gap: space.sm, paddingTop: space.xl },
  title: { fontSize: 20, textAlign: "center" },
  text: { fontSize: 15, lineHeight: 22 },
  wide: { alignSelf: "stretch" },
});
