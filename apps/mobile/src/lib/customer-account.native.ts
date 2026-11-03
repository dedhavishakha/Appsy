import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthRequest, CodeChallengeMethod, ResponseType } from "expo-auth-session";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { ACCOUNT_SCHEME } from "@appsy/app-config";
import { SignedOutError, type AccountClient } from "./account";

// Shopify's Customer Account API sign-in, as in Seeaash (https://shopify.dev/docs/api/customer):
// OAuth with PKCE for a public mobile client, in a private browser session on iPhone. The
// addresses come from the storefront's discovery files, so they follow Shopify's changes. The
// tokens stay on the phone, in its secure storage, and go only to Shopify.

// Each token under its own key: some iOS releases refused values above roughly 2048 bytes
// (Expo's SecureStore docs). `client` says which client they belong to, so a new client ID
// signs the shopper out.
const KEYS = {
  client: "appsy.account.client",
  access: "appsy.account.access",
  refresh: "appsy.account.refresh",
  id: "appsy.account.id",
  expires: "appsy.account.expires",
} as const;
// In the app's ordinary storage, which goes with the app (see forgetIfReinstalled).
const INSTALLED_KEY = "appsy.account.installed";
// Shopify: a 403 from the token address may mean a request without a user agent.
const USER_AGENT = "Appsy (React Native)";
// Renewed this long before Shopify's expiry, so a request never carries an expired token.
const RENEW_MS = 60_000;
const SCOPES = ["openid", "email", "customer-account-api:full"];

type Tokens = { access: string; refresh: string | null; id: string | null; expires: number };
type OpenIdConfig = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
};

// The store's callback scheme, shop.<store ID>.appsy, which builds since release 3 register
// (app.config.js). Older builds and Expo Go have none, so they can't sign in.
function registeredScheme(): string | null {
  const scheme = Constants.expoConfig?.scheme;
  const schemes = Array.isArray(scheme) ? scheme : scheme ? [scheme] : [];
  return schemes.find((entry) => ACCOUNT_SCHEME.test(entry)) ?? null;
}

export const signInSupported = registeredScheme() !== null;

const discovered = new Map<string, Promise<unknown>>();

// One of the storefront's discovery files, read once (again after a failure).
function discover<T>(client: AccountClient, file: string): Promise<T> {
  const url = `${client.storefrontUrl.replace(/\/+$/, "")}/.well-known/${file}`;
  let found = discovered.get(url);
  if (!found) {
    found = fetch(url, { headers: { Accept: "application/json" } }).then((response) => {
      if (!response.ok) throw new Error("The store's sign-in isn't available right now.");
      return response.json();
    });
    found.catch(() => discovered.delete(url));
    discovered.set(url, found);
  }
  return found as Promise<T>;
}

const openIdConfig = (client: AccountClient) =>
  discover<OpenIdConfig>(client, "openid-configuration");

// Discovery names Shopify's newest API version; the app asks for the one its queries were
// checked against (the published file's), in Shopify's versioned format.
async function graphqlUrl(client: AccountClient): Promise<string> {
  const { graphql_api } = await discover<{ graphql_api: string }>(client, "customer-account-api");
  return graphql_api.replace(/\/api\/[^/]+\/graphql$/, `/api/${client.apiVersion}/graphql`);
}

async function readTokens(clientId: string): Promise<Tokens | null> {
  const [client, access, refresh, id, expires] = await Promise.all([
    SecureStore.getItemAsync(KEYS.client),
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.id),
    SecureStore.getItemAsync(KEYS.expires),
  ]);
  if (client !== clientId || !access || !expires) return null;
  return { access, refresh, id, expires: Number(expires) };
}

async function saveTokens(clientId: string, tokens: Tokens) {
  const save = (key: string, value: string | null) =>
    value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key);
  await save(KEYS.client, clientId);
  await save(KEYS.access, tokens.access);
  await save(KEYS.refresh, tokens.refresh);
  await save(KEYS.id, tokens.id);
  await save(KEYS.expires, String(tokens.expires));
}

async function clearTokens() {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
}

// iPhones may keep secure storage after the app is removed (Expo's SecureStore docs), so a
// reinstalled app could start signed in. The app's ordinary storage goes with the app: without
// its mark, any tokens are left from before.
export async function forgetIfReinstalled() {
  if (await AsyncStorage.getItem(INSTALLED_KEY)) return;
  await clearTokens();
  await AsyncStorage.setItem(INSTALLED_KEY, "1");
}

// Shopify refused the request, as opposed to the phone not reaching it.
class TokenError extends Error {}

async function requestTokens(
  client: AccountClient,
  body: Record<string, string>,
  previous?: Tokens,
): Promise<Tokens> {
  const { token_endpoint } = await openIdConfig(client);
  const response = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: Object.entries(body)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&"),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    if (response.status >= 500) throw new Error("The store's sign-in isn't available right now.");
    throw new TokenError("Please sign in again.");
  }
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? previous?.refresh ?? null,
    id: json.id_token ?? previous?.id ?? null,
    expires: Date.now() + (json.expires_in ?? 0) * 1000,
  };
}

// The nonce in Shopify's ID token, which must be the one the app sent.
function tokenNonce(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1] ?? "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof json.nonce === "string" ? json.nonce : null;
  } catch {
    return null;
  }
}

// Opens Shopify's sign-in page (a one-time code by email) and keeps the tokens. False: the
// shopper closed the page.
export async function signIn(client: AccountClient): Promise<boolean> {
  const scheme = registeredScheme();
  if (!scheme) throw new Error("Signing in needs the latest version of this app.");
  const redirectUri = `${scheme}://callback`;
  const config = await openIdConfig(client);
  const nonce = Crypto.randomUUID();
  const request = new AuthRequest({
    clientId: client.clientId,
    redirectUri,
    scopes: SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
    codeChallengeMethod: CodeChallengeMethod.S256,
    extraParams: { nonce },
  });
  const result = await request.promptAsync(
    { authorizationEndpoint: config.authorization_endpoint },
    { preferEphemeralSession: true },
  );
  if (result.type === "error") throw new Error("Signing in didn't finish. Please try again.");
  if (result.type !== "success") return false;
  const code = result.params.code;
  if (!code) throw new Error("Signing in didn't finish. Please try again.");

  const tokens = await requestTokens(client, {
    grant_type: "authorization_code",
    client_id: client.clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: request.codeVerifier ?? "",
  });
  if (tokens.id && tokenNonce(tokens.id) !== nonce) {
    throw new Error("Signing in didn't finish. Please try again.");
  }
  await saveTokens(client.clientId, tokens);
  return true;
}

let renewing: Promise<string | null> | null = null;

// A current access token, renewed with the refresh token when it's about to expire. Null: the
// shopper isn't signed in (any more). A phone that can't reach Shopify keeps its tokens.
export async function accessToken(client: AccountClient): Promise<string | null> {
  const tokens = await readTokens(client.clientId);
  if (!tokens) return null;
  if (tokens.expires - Date.now() > RENEW_MS) return tokens.access;
  if (!tokens.refresh) {
    await clearTokens();
    return null;
  }
  const refresh = tokens.refresh;
  renewing ??= requestTokens(
    client,
    { grant_type: "refresh_token", client_id: client.clientId, refresh_token: refresh },
    tokens,
  )
    .then(async (fresh) => {
      await saveTokens(client.clientId, fresh);
      return fresh.access;
    })
    .catch(async (error: unknown) => {
      if (!(error instanceof TokenError)) throw error;
      await clearTokens();
      return null;
    })
    .finally(() => {
      renewing = null;
    });
  return renewing;
}

// Whether the phone has the shopper's tokens for this client, without asking Shopify.
export async function hasSession(client: AccountClient): Promise<boolean> {
  return (await readTokens(client.clientId)) !== null;
}

// Forgets the tokens and ends the session at Shopify: a mobile client calls the logout
// address with the ID token and gets 200 OK (https://shopify.dev/docs/api/customer).
export async function signOut(client: AccountClient): Promise<void> {
  const tokens = await readTokens(client.clientId);
  await clearTokens();
  if (!tokens?.id) return;
  try {
    const { end_session_endpoint } = await openIdConfig(client);
    await fetch(`${end_session_endpoint}?id_token_hint=${encodeURIComponent(tokens.id)}`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    // The phone has forgotten the tokens either way.
  }
}

// A Customer Account API request as the signed-in shopper. SignedOutError: there's no
// session, or Shopify ended it.
export async function customerQuery<T>(
  client: AccountClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await accessToken(client);
  if (!token) throw new SignedOutError();
  const response = await fetch(await graphqlUrl(client), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) {
    await clearTokens();
    throw new SignedOutError();
  }
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "The store is busy right now. Please try again in a moment."
        : `Couldn't reach your account (${response.status}).`,
    );
  }
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("\n"));
  if (!json.data) throw new Error("Your account returned an empty response.");
  return json.data;
}
