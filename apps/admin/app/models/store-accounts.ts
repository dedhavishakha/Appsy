import { z } from "zod";

// The merchant's App Store and Google Play connection, on the Publishing page: their app's
// App ID, and the keys from their own developer accounts that Appsy builds and uploads the
// app with. Shared by the page (components/store-accounts.tsx) and the server
// (models/store-accounts.server.ts).

// One App ID is both the bundle ID and the package name. Apple allows "only alphanumeric
// characters (A–Z, a–z, and 0–9), hyphens (-), and periods (.)"; Google needs "at least
// two segments", each starting with a letter, in [a-zA-Z0-9_]. Lowercase letters and digits
// in two or more parts, each starting with a letter, suit both.
export const APP_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
// Appsy's own limit, to keep App IDs readable.
export const APP_ID_MAX = 100;

export function suggestAppId(shopDomain: string) {
  const name = shopDomain
    .replace(/\.myshopify\.com$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!name) return "com.yourbrand.app";
  return `com.${/^[a-z]/.test(name) ? name : `app${name}`}.app`;
}

// Expo's names for Apple account types (EXPO_APPLE_TEAM_TYPE); in-house (enterprise)
// accounts can't publish on the App Store.
export const APPLE_TEAM_TYPES = {
  COMPANY_OR_ORGANIZATION: "Organization",
  INDIVIDUAL: "Individual",
} as const;
export type AppleTeamType = keyof typeof APPLE_TEAM_TYPES;

// Apple's formats: the issuer ID is a UUID; key and team IDs are 10 characters; an app's
// Apple ID is a number.
export const ISSUER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const APPLE_KEY_ID = /^[A-Z0-9]{10}$/;
export const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
export const ASC_APP_ID = /^\d{1,20}$/;

// What the page shows; never the keys.
export const storeAccountsSchema = z.object({
  apple: z
    .object({
      issuerId: z.string(),
      keyId: z.string(),
      teamId: z.string(),
      teamType: z.enum(["COMPANY_OR_ORGANIZATION", "INDIVIDUAL"]),
      // The app record's Apple ID in App Store Connect, once the merchant adds it.
      ascAppId: z.string().nullable(),
      // Whether the App ID is registered as a bundle ID in the merchant's Apple account.
      bundleRegistered: z.boolean(),
      testedAt: z.string(),
    })
    .optional(),
  google: z
    .object({
      clientEmail: z.string(),
      // Whether Google Play let the key open the app; before the app's first upload,
      // Google Play doesn't know its package name yet.
      appAccess: z.boolean(),
      testedAt: z.string(),
    })
    .optional(),
});
export type StoreAccounts = z.output<typeof storeAccountsSchema>;

export type StoreIntent =
  | "app-id"
  | "apple"
  | "apple-app"
  | "register-bundle"
  | "google"
  | "disconnect-apple"
  | "disconnect-google";

export type StoreField =
  | "appId"
  | "issuerId"
  | "keyId"
  | "teamId"
  | "teamType"
  | "privateKey"
  | "ascAppId"
  | "serviceAccount";

export type StoreIssue = { field: StoreField | null; message: string };
export type StoreResult = {
  intent: StoreIntent;
  issues: StoreIssue[];
  // Shown as a toast when it worked.
  notice?: string;
};
