import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  accountStyles,
  Centred,
  Field,
  Problem,
  SignedOutNote,
} from "@/components/account-ui";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { useCustomer, useProfileUpdate } from "@/lib/account-data";
import type { Customer } from "@/lib/account-queries";
import { gutter, space, useColors } from "@/lib/app-settings";
import { BORDER } from "@/lib/menu-drawer";

// The shopper's name, which they can change, and the email and phone Shopify has for them.
export default function ProfileScreen() {
  const { status } = useAccount();
  const { data, isLoading, error, refetch } = useCustomer();
  if (status !== "signedIn") return <SignedOutNote />;
  if (isLoading) return <Centred />;
  if (error || !data) return <Problem error={error} onRetry={() => void refetch()} />;
  return <ProfileForm customer={data} />;
}

function ProfileForm({ customer }: { customer: Customer }) {
  const colors = useColors();
  const update = useProfileUpdate();
  const [firstName, setFirstName] = useState(customer.firstName ?? "");
  const [lastName, setLastName] = useState(customer.lastName ?? "");

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.form}
      keyboardShouldPersistTaps="handled"
    >
      <Field
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
      />
      <Field
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoComplete="family-name"
      />
      <View style={[styles.fixed, { borderColor: BORDER }]}>
        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {customer.emailAddress?.emailAddress ?? "None"}
        </Text>
        <Text style={[styles.label, styles.gap, { color: colors.text }]}>Phone</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {customer.phoneNumber?.phoneNumber ?? "None"}
        </Text>
      </View>
      {update.error ? <Text style={accountStyles.error}>{update.error.message}</Text> : null}
      <Button
        title="Save"
        loading={update.isPending}
        onPress={() =>
          update.mutate(
            { firstName: firstName.trim(), lastName: lastName.trim() },
            { onSuccess: () => router.back() },
          )
        }
        style={styles.save}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { padding: gutter, gap: space.lg, paddingBottom: space.xxl },
  fixed: { borderWidth: 1, padding: space.lg, gap: 2 },
  label: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", opacity: 0.75 },
  value: { fontSize: 15 },
  gap: { marginTop: space.sm },
  save: { alignSelf: "stretch" },
});
