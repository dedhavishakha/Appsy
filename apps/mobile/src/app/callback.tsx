import { Redirect } from "expo-router";

// Shopify's sign-in page returns to shop.<store ID>.appsy://callback (lib/customer-account).
// The sign-in session takes that address itself; when the phone also opens it in the app, as
// in Seeaash, the shopper lands back on the Account tab.
export default function SignInCallback() {
  return <Redirect href="/account" />;
}
