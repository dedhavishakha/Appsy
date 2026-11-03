import { createContext, useContext } from "react";

// What the app signs shoppers in with: the store's Customer Account API client (Appsy's
// Functionality page), its storefront, whose discovery files name Shopify's addresses, and
// the API version the app's queries were checked against (lib/customer-account).
export type AccountClient = { clientId: string; storefrontUrl: string; apiVersion: string };

// There's no session, or Shopify ended it: the app shows the shopper signed out.
export class SignedOutError extends Error {
  constructor() {
    super("Please sign in again.");
    this.name = "SignedOutError";
  }
}

export type AccountStatus = "unknown" | "signedOut" | "signedIn";

// The shopper's account data in the query cache, dropped when they sign out.
export const ACCOUNT_KEY = ["account"] as const;

// Shopper accounts as the app's screens see them (components/account-provider.tsx).
export type Account = {
  // The store switched shopper accounts on, with its client ID.
  offered: boolean;
  // This build can sign in: it registered the store's callback address (release 3 on), and
  // it isn't the editor's preview.
  supported: boolean;
  status: AccountStatus;
  // Signing in or out right now.
  busy: boolean;
  // Throw with a message for the shopper.
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  // A current access token, for the bag and checkout; null while signed out.
  accessToken: () => Promise<string | null>;
  // A Customer Account API request as the shopper; an ended session signs them out.
  query: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
  // Asks the store to delete the shopper's account (links.accountDeletion), with the phone's
  // notification ID when it has one, then signs them out. Throws with a message for the
  // shopper; returns when it was asked.
  deleteAccount: (installId: string | null) => Promise<Date>;
  // When this phone last asked for its shopper's account to be deleted, until Shopify should
  // have erased it.
  deletionRequestedAt: Date | null;
};

export const AccountContext = createContext<Account>({
  offered: false,
  supported: false,
  status: "signedOut",
  busy: false,
  signIn: async () => {},
  signOut: async () => {},
  accessToken: async () => null,
  query: async () => {
    throw new SignedOutError();
  },
  deleteAccount: async () => {
    throw new SignedOutError();
  },
  deletionRequestedAt: null,
});

export function useAccount(): Account {
  return useContext(AccountContext);
}
