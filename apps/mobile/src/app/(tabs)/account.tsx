import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { erasedBy } from "@appsy/app-config";
import { accountStyles, Centred, Row } from "@/components/account-ui";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { formatDate, useCustomer } from "@/lib/account-data";
import { gutter, space, useSettings } from "@/lib/app-settings";

// The Account tab, as in Seeaash: signing in with the store's Shopify customer account
// (Shopify's own sign-in page), then the shopper's orders, addresses and profile, signing
// out, and deleting the account (Apple 5.1.1(v)).
export default function AccountScreen() {
  const settings = useSettings();
  const { colors } = settings.theme;
  const { status } = useAccount();

  if (status === "unknown") return <Centred />;
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {status === "signedIn" ? <SignedIn /> : <SignIn store={settings.app?.name} />}
    </ScrollView>
  );
}

function SignIn({ store }: { store?: string }) {
  const { colors } = useSettings().theme;
  const account = useAccount();
  const [problem, setProblem] = useState<string | null>(null);

  const signIn = () => {
    setProblem(null);
    account
      .signIn()
      .catch((error: unknown) =>
        setProblem(
          error instanceof Error ? error.message : "Signing in didn't finish. Please try again.",
        ),
      );
  };

  return (
    <View style={styles.card}>
      <Ionicons name="person-circle-outline" size={48} color={colors.text} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {store ? `Your ${store} account` : "Your account"}
      </Text>
      <Text style={[styles.text, { color: colors.text }]}>
        Sign in to see your orders and saved addresses, and to check out signed in.
      </Text>
      <Button title="Sign in" loading={account.busy} onPress={signIn} style={styles.wide} />
      {problem ? <Text style={accountStyles.error}>{problem}</Text> : null}
      {account.deletionRequestedAt ? (
        <Text style={[styles.text, styles.deletion, { color: colors.text }]}>
          You asked to delete your account on {formatDate(account.deletionRequestedAt.toISOString())}.
          Shopify erases it by {formatDate(erasedBy(account.deletionRequestedAt).toISOString())}.
        </Text>
      ) : null}
    </View>
  );
}

function SignedIn() {
  const { colors } = useSettings().theme;
  const account = useAccount();
  const customer = useCustomer();
  const name = customer.data?.firstName || customer.data?.displayName;
  const email = customer.data?.emailAddress?.emailAddress;

  const signOut = () =>
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void account.signOut() },
    ]);

  return (
    <View>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {name ? `Hello, ${name}` : "Hello"}
        </Text>
        {email ? <Text style={[styles.text, { color: colors.text }]}>{email}</Text> : null}
        {customer.error ? (
          <Pressable accessibilityRole="button" onPress={() => void customer.refetch()}>
            <Text style={accountStyles.error}>
              Your details didn&apos;t load. Tap to try again.
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Row icon="receipt-outline" label="Orders" onPress={() => router.push("/account/orders")} />
      <Row
        icon="location-outline"
        label="Addresses"
        onPress={() => router.push("/account/addresses")}
      />
      <Row icon="person-outline" label="Profile" onPress={() => router.push("/account/profile")} />
      <Button
        title="Sign out"
        variant="secondary"
        loading={account.busy}
        onPress={signOut}
        style={[styles.wide, styles.signOut]}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/account/delete")}
        style={styles.delete}
      >
        <Text style={[styles.deleteText, { color: colors.text }]}>Delete account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  card: { alignItems: "center", gap: space.sm, padding: space.xl, paddingTop: space.xxl },
  title: { fontSize: 20, textAlign: "center" },
  text: { fontSize: 14, textAlign: "center", opacity: 0.75 },
  wide: { alignSelf: "stretch" },
  deletion: { marginTop: space.lg },
  signOut: { marginHorizontal: gutter, marginTop: space.xl },
  delete: { alignSelf: "center", padding: space.lg },
  deleteText: { fontSize: 13, textDecorationLine: "underline", opacity: 0.75 },
});
