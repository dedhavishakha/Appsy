import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { accountClientId, erasedBy } from "@appsy/app-config";
import {
  ACCOUNT_KEY,
  AccountContext,
  SignedOutError,
  type AccountClient,
  type AccountStatus,
} from "@/lib/account";
import { useSettings } from "@/lib/app-settings";
import { useBagOwner } from "@/lib/cart";
import * as auth from "@/lib/customer-account";
import { isPreview } from "@/lib/settings";

// When this phone asked for its shopper's account to be deleted (an ISO date).
const DELETION_KEY = "appsy.account.deletionRequestedAt";
const SEND_PROBLEM = "Your request couldn't be sent. Check your connection and try again.";
const SIGN_IN_AGAIN = "Please sign in again, then try again.";

// Shopper accounts (app-config accounts.ts): whether the shopper is signed in to the store's
// Shopify customer account, signing in and out, and their requests to the Customer Account
// API. The store's client comes from the published file, so switching accounts off, or a new
// client ID, takes effect without a new build; signing in needs a build that registered the
// store's callback address.
export function AccountProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const bag = useBagOwner();
  const clientId = accountClientId(settings);
  const { storefrontUrl, apiVersion } = settings.shop;
  const client = useMemo<AccountClient | null>(
    () => (clientId ? { clientId, storefrontUrl, apiVersion } : null),
    [clientId, storefrontUrl, apiVersion],
  );
  const supported = auth.signInSupported;
  const deletionUrl = settings.links.accountDeletion;
  const [status, setStatus] = useState<AccountStatus>("unknown");
  const [busy, setBusy] = useState(false);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<Date | null>(null);

  // A deletion request this phone made shows until Shopify should have erased the account.
  useEffect(() => {
    AsyncStorage.getItem(DELETION_KEY)
      .then((saved) => {
        const asked = saved ? new Date(saved) : null;
        if (asked && !Number.isNaN(asked.getTime()) && erasedBy(asked) > new Date()) {
          setDeletionRequestedAt(asked);
        } else if (saved) {
          void AsyncStorage.removeItem(DELETION_KEY);
        }
      })
      .catch(() => {});
  }, []);

  // At start, and with a new client: tokens left from before the app was removed go, then the
  // phone's tokens for this client say whether the shopper is signed in.
  useEffect(() => {
    if (!client || !supported) {
      setStatus("signedOut");
      return;
    }
    let current = true;
    auth
      .forgetIfReinstalled()
      .then(() => auth.hasSession(client))
      .then((signedIn) => current && setStatus(signedIn ? "signedIn" : "signedOut"))
      .catch(() => current && setStatus("signedOut"));
    return () => {
      current = false;
    };
  }, [client, supported]);

  const signedOut = useCallback(() => {
    queryClient.removeQueries({ queryKey: ACCOUNT_KEY });
    setStatus("signedOut");
  }, [queryClient]);

  const signIn = useCallback(async () => {
    if (!client) return;
    if (!supported) {
      throw new Error(
        isPreview
          ? "Shoppers sign in in your app on their phones."
          : "This version of the app can't sign in. Please update the app.",
      );
    }
    setBusy(true);
    try {
      if (!(await auth.signIn(client))) return;
      setStatus("signedIn");
      const token = await auth.accessToken(client).catch(() => null);
      if (token) await bag.attach(token).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [client, supported, bag]);

  const signOut = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      await auth.signOut(client);
      signedOut();
      await bag.detach().catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [client, signedOut, bag]);

  // A phone that can't reach Shopify gets no token (the bag carries on as a guest's) but
  // stays signed in; a session Shopify ended signs the shopper out.
  const accessToken = useCallback(async () => {
    if (!client || status !== "signedIn") return null;
    try {
      const token = await auth.accessToken(client);
      if (!token) signedOut();
      return token;
    } catch {
      return null;
    }
  }, [client, status, signedOut]);

  const query = useCallback(
    async <T,>(document: string, variables?: Record<string, unknown>): Promise<T> => {
      if (!client) throw new SignedOutError();
      try {
        return await auth.customerQuery<T>(client, document, variables);
      } catch (error) {
        if (error instanceof SignedOutError) signedOut();
        throw error;
      }
    },
    [client, signedOut],
  );

  // Appsy checks the token with Shopify and asks Shopify to erase the customer
  // (routes/api.accounts.$appId_.delete.tsx in the admin). Then the shopper is signed out here.
  const deleteAccount = useCallback(
    async (installId: string | null) => {
      if (!client || !deletionUrl) throw new Error(SEND_PROBLEM);
      setBusy(true);
      try {
        const token = await auth.accessToken(client).catch(() => null);
        if (!token) {
          signedOut();
          throw new Error(SIGN_IN_AGAIN);
        }
        const response = await fetch(deletionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
          body: JSON.stringify(installId ? { installId } : {}),
        }).catch(() => null);
        if (response?.status === 401) {
          await auth.signOut(client);
          signedOut();
          throw new Error(SIGN_IN_AGAIN);
        }
        if (!response) throw new Error(SEND_PROBLEM);
        if (!response.ok) {
          throw new Error("Your request couldn't be sent just now. Please try again later.");
        }
        const { requestedAt } = (await response.json()) as { requestedAt: string };
        const asked = new Date(requestedAt);
        await AsyncStorage.setItem(DELETION_KEY, asked.toISOString()).catch(() => {});
        setDeletionRequestedAt(asked);
        await auth.signOut(client);
        signedOut();
        await bag.detach().catch(() => {});
        return asked;
      } finally {
        setBusy(false);
      }
    },
    [client, deletionUrl, signedOut, bag],
  );

  const account = useMemo(
    () => ({
      offered: client !== null,
      supported,
      status,
      busy,
      signIn,
      signOut,
      accessToken,
      query,
      deleteAccount,
      deletionRequestedAt,
    }),
    [
      client,
      supported,
      status,
      busy,
      signIn,
      signOut,
      accessToken,
      query,
      deleteAccount,
      deletionRequestedAt,
    ],
  );
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
