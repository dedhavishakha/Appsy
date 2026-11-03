// Shopper accounts on the Functionality page, as both the server (accounts.server.ts) and the
// page's own code need them.

// write_customer_data_erasure: an optional scope (shopify.app.toml) the store grants on the
// Functionality page, so shoppers can ask for their account to be deleted in the app
// (customerRequestDataErasure, https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerRequestDataErasure).
export const ERASURE_SCOPE = "write_customer_data_erasure";

// Which customer accounts the store uses in its online store and checkout: Shopify's
// customer accounts, which the Customer Account API needs, or the legacy ones (CLASSIC).
export type CustomerAccountsVersion = "NEW_CUSTOMER_ACCOUNTS" | "CLASSIC";

// The other sign-in options on the store's Shopify sign-in page (Shop.socialLoginProviders)
// and Apple's App Review guideline 4.8: an app whose sign-in uses a third-party or social
// login service must also offer an equivalent private one, unless it uses only the store's
// own sign-in. Decided 2026-11-03:
// - "apple": Sign in with Apple, once Shopify offers it, is that private one;
// - "shop": Sign in with Shop, which stores with Shop Pay can't turn off, is allowed, with a
//   note for App Review (Apple's list of examples doesn't name it);
// - "blocking": any other, such as Google or Facebook: iPhone builds wait until it's off.
export type SignInOptionKind = "apple" | "shop" | "blocking";

export function signInOptionKind(handle: string): SignInOptionKind {
  const name = handle.trim().toLowerCase();
  if (name.includes("apple")) return "apple";
  if (name === "shop") return "shop";
  return "blocking";
}

// The options that hold up iPhone builds: none once Sign in with Apple is there too.
export function iphoneBlockingSignIns(handles: string[]): string[] {
  if (handles.some((handle) => signInOptionKind(handle) === "apple")) return [];
  return handles.filter((handle) => signInOptionKind(handle) === "blocking");
}

// Where a store turns sign-in options off (Shopify Help Center, "Managing your social
// sign-in options" and "Sign in with Shop").
export const SIGN_IN_SETTINGS =
  "Settings › Customer accounts › Authentication › Manage";
