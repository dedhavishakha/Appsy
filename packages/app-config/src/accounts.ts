import { z } from "zod";
import type { AppDesign } from "./design";

// Shopper accounts (Appsy's Functionality page; doc 03, section P). Shoppers sign in with the
// store's own Shopify customer accounts, through the Customer Account API client of a
// storefront the store makes in Shopify's Headless channel: a public client of the mobile
// type, which Shopify gives refresh tokens (https://shopify.dev/docs/api/customer). Signing in
// and everything the Account tab shows go between the phone and Shopify only (decided
// 2026-11-02: the store's own client, no sign-in of Appsy's).
export const ACCOUNT_FEATURE = "account";

// From Headless › the storefront › Customer Account API settings › Credentials. Not a secret:
// it's inside the app. Shopify doesn't document its format, so this only keeps out what can't
// be one.
export const customerAccountClientId = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{8,100}$/,
    "Paste the Client ID from your storefront's Customer Account API settings in Shopify",
  );

export const accountSettings = z.object({ clientId: customerAccountClientId.optional() });
export type AccountSettings = z.output<typeof accountSettings>;

// The store's settings, kept while accounts are off so they stay the same.
export function savedAccountSettings(design: Pick<AppDesign, "features">): AccountSettings {
  const settings = accountSettings.safeParse(design.features[ACCOUNT_FEATURE]?.settings ?? {});
  return settings.success ? settings.data : {};
}

// The client the app signs shoppers in with, while accounts are on.
export function accountClientId(design: Pick<AppDesign, "features">): string | null {
  return design.features[ACCOUNT_FEATURE]?.enabled === true
    ? (savedAccountSettings(design).clientId ?? null)
    : null;
}

// Saves the store's client ID, keeping the switch as it is.
export function setAccountClientId(design: AppDesign, clientId: string): AppDesign {
  const enabled = design.features[ACCOUNT_FEATURE]?.enabled === true;
  return {
    ...design,
    features: {
      ...design.features,
      [ACCOUNT_FEATURE]: { enabled, settings: { ...savedAccountSettings(design), clientId } },
    },
  };
}

// Shopify: a mobile client's callback URLs "must use the custom scheme 'shop.{shop_id}.*'"
// (https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/getting-started).
// Every app Appsy builds registers shop.<the store's ID>.appsy (apps/mobile/app.config.js
// writes the same pattern), and signs in with that scheme's callback.
export const ACCOUNT_SCHEME = /^shop\.(\d+)\.appsy$/;

export function accountScheme(shopId: string): string {
  return `shop.${shopId}.appsy`;
}

export function accountCallbackUrl(shopId: string): string {
  return `${accountScheme(shopId)}://callback`;
}

// The store's ID as the scheme uses it: the number in its Shopify ID (gid://shopify/Shop/123),
// the same number Shopify's own sign-in addresses carry.
export function shopNumber(shopGid: string): string | null {
  return /^gid:\/\/shopify\/Shop\/(\d+)$/.exec(shopGid)?.[1] ?? null;
}

// Deleting an account, from the Account tab (Apple 5.1.1(v)): the app sends the shopper's
// token to Appsy (links.accountDeletion), which asks Shopify to erase the customer
// (customerRequestDataErasure). Shopify erases personal data such as name and address, and
// keeps what was sold and when; the store has 10 days to cancel a request, and Shopify tells
// apps 10 days after it (Shopify Help Center, "Processing customer data requests";
// https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).
export const ERASE_AFTER_DAYS = 10;

// What the app sends with the request: its install ID for notifications, when the shopper has
// them on, so Appsy can tell this phone once Shopify says the account is erased.
export const accountDeletionInput = z.object({ installId: z.uuid().optional() });
export type AccountDeletionInput = z.output<typeof accountDeletionInput>;

// When Shopify should have erased an account asked for at `requestedAt`.
export function erasedBy(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ERASE_AFTER_DAYS * 24 * 60 * 60 * 1000);
}
