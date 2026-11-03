import { SignedOutError, type AccountClient } from "./account";

// Shopper sign-in works in the app on a phone (customer-account.native.ts): the editor's
// preview, on the web, shows the Account tab signed out, and its button only explains.

export const signInSupported = false;

export async function forgetIfReinstalled(): Promise<void> {}

export async function signIn(_client: AccountClient): Promise<boolean> {
  throw new Error("Shoppers sign in in your app on their phones.");
}

export async function accessToken(_client: AccountClient): Promise<string | null> {
  return null;
}

export async function hasSession(_client: AccountClient): Promise<boolean> {
  return false;
}

export async function signOut(_client: AccountClient): Promise<void> {}

export async function customerQuery<T>(
  _client: AccountClient,
  _query: string,
  _variables?: Record<string, unknown>,
): Promise<T> {
  throw new SignedOutError();
}
