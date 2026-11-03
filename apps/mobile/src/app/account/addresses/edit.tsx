import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import {
  accountStyles,
  Centred,
  Field,
  Note,
  SignedOutNote,
} from "@/components/account-ui";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { useAddressActions, useAddresses } from "@/lib/account-data";
import type { AddressInput, CustomerAddress } from "@/lib/account-queries";
import { gutter, space, useColors } from "@/lib/app-settings";

// Changes one saved address. Its country and region stay as they are (see the addresses
// screen); Shopify checks the rest and says what it refuses.
export default function EditAddressScreen() {
  const { status } = useAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useAddresses();
  const address = data?.addresses.find((entry) => entry.id === id);

  if (status !== "signedIn") return <SignedOutNote />;
  if (isLoading) return <Centred />;
  if (!address) {
    return (
      <Centred>
        <Note icon="location-outline" title="This address wasn't found" />
      </Centred>
    );
  }
  return <AddressForm address={address} />;
}

function AddressForm({ address }: { address: CustomerAddress }) {
  const colors = useColors();
  const { update } = useAddressActions();
  const [form, setForm] = useState({
    firstName: address.firstName ?? "",
    lastName: address.lastName ?? "",
    company: address.company ?? "",
    address1: address.address1 ?? "",
    address2: address.address2 ?? "",
    city: address.city ?? "",
    zip: address.zip ?? "",
    phoneNumber: address.phoneNumber ?? "",
  });
  const [missing, setMissing] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const required = [form.address1, form.city].every((value) => value.trim() !== "");
    setMissing(!required);
    if (!required) return;
    // Shopify takes phone numbers in E.164, like +919876543210.
    const phone = form.phoneNumber.replace(/[\s().-]/g, "");
    const input: AddressInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      company: form.company.trim(),
      address1: form.address1.trim(),
      address2: form.address2.trim(),
      city: form.city.trim(),
      zip: form.zip.trim(),
      ...(phone ? { phoneNumber: phone } : {}),
      ...(address.territoryCode ? { territoryCode: address.territoryCode } : {}),
      ...(address.zoneCode ? { zoneCode: address.zoneCode } : {}),
    };
    update.mutate({ id: address.id, address: input }, { onSuccess: () => router.back() });
  };

  const place = [address.zoneCode, address.territoryCode].filter(Boolean).join(", ");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field
          label="First name"
          value={form.firstName}
          onChangeText={set("firstName")}
          autoComplete="given-name"
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChangeText={set("lastName")}
          autoComplete="family-name"
        />
        <Field label="Company (optional)" value={form.company} onChangeText={set("company")} />
        <Field
          label="Address"
          value={form.address1}
          onChangeText={set("address1")}
          autoComplete="address-line1"
        />
        <Field
          label="Apartment, suite, etc. (optional)"
          value={form.address2}
          onChangeText={set("address2")}
          autoComplete="address-line2"
        />
        <Field label="City" value={form.city} onChangeText={set("city")} />
        <Field
          label="Postal code"
          value={form.zip}
          onChangeText={set("zip")}
          autoComplete="postal-code"
        />
        <Field
          label="Phone (optional)"
          value={form.phoneNumber}
          onChangeText={set("phoneNumber")}
          keyboardType="phone-pad"
          autoComplete="tel"
          hint="With your country code, like +91 98765 43210."
        />
        {place ? (
          <Text style={[styles.place, { color: colors.text }]}>
            Region and country: {place}. These can&apos;t be changed here.
          </Text>
        ) : null}
        {missing ? (
          <Text style={accountStyles.error}>Enter the address and the city.</Text>
        ) : null}
        {update.error ? <Text style={accountStyles.error}>{update.error.message}</Text> : null}
        <Button title="Save address" loading={update.isPending} onPress={save} style={styles.save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: { padding: gutter, gap: space.lg, paddingBottom: space.xxl },
  place: { fontSize: 13, opacity: 0.75 },
  save: { alignSelf: "stretch" },
});
