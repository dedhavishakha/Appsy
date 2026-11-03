import { createHash } from "node:crypto";
import {
  ACCOUNT_DELETION_KEEP_DAYS,
  accountClientId,
  type AccountDeletionInput,
  type PublishedSettings,
} from "@appsy/app-config";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { loadLiveSettings } from "./design.server";
import { sendersFor } from "./push.server";
import { getStoreKeys } from "./vault.server";

// Shoppers' requests, from the app's Account tab, to delete their accounts (app-config
// accounts.ts). Appsy learns who the shopper is from Shopify, with the shopper's own Customer
// Account API token, then asks Shopify to erase the customer (customerRequestDataErasure,
// which needs the store's optional scope write_customer_data_erasure). Shopify sends the
// customers/redact webhook "10 days after the deletion request" to apps that have access to
// the store's customer or order data
// (https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance); when it comes,
// Appsy tells the phone that asked, if it has notifications on. Requests are kept
// ACCOUNT_DELETION_KEEP_DAYS at most (the stores' privacy text says so).

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

const CUSTOMER_ID_QUERY = `query AppsyCustomerId { customer { id } }`;

const ERASE_MUTATION = `#graphql
  mutation AppsyEraseCustomer($customerId: ID!) {
    customerRequestDataErasure(customerId: $customerId) {
      customerId
      userErrors {
        field
        message
        code
      }
    }
  }`;

type EraseData = {
  data?: {
    customerRequestDataErasure: {
      customerId: string | null;
      userErrors: { message: string; code: string | null }[];
    } | null;
  };
  errors?: unknown;
};

export type DeletionResult =
  | { status: 200; requestedAt: string }
  // Not signed in, or Shopify refused the token.
  | { status: 401 }
  // No such app, or shopper accounts are off.
  | { status: 404 }
  // The store can't take the request now.
  | { status: 503 };

const CUSTOMER_ID = /^gid:\/\/shopify\/Customer\/\d+$/;

// The Customer Account API address from the storefront's discovery file, in the version the
// app uses (as the phone builds it, apps/mobile/src/lib/customer-account.native.ts). Only an
// HTTPS address with a host name.
async function graphqlUrl(settings: PublishedSettings): Promise<string | null> {
  const base = settings.shop.storefrontUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/.well-known/customer-account-api`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const { graphql_api: found } = (await response.json()) as {
    graphql_api?: unknown;
  };
  if (typeof found !== "string") return null;
  const url = found.replace(
    /\/api\/[^/]+\/graphql$/,
    `/api/${settings.shop.apiVersion}/graphql`,
  );
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" || !/[a-z]/i.test(hostname)) return null;
  } catch {
    return null;
  }
  return url;
}

// Who the token belongs to: their Shopify customer ID, null when Shopify refuses the token,
// or "unavailable" when Shopify couldn't be asked.
async function customerOf(
  settings: PublishedSettings,
  token: string,
): Promise<string | null | "unavailable"> {
  try {
    const url = await graphqlUrl(settings);
    if (!url) return "unavailable";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "User-Agent": "Appsy",
      },
      body: JSON.stringify({ query: CUSTOMER_ID_QUERY }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) return "unavailable";
    const body = (await response.json()) as {
      data?: { customer?: { id?: unknown } | null };
    };
    const id = body.data?.customer?.id;
    return typeof id === "string" && CUSTOMER_ID.test(id) ? id : null;
  } catch (error) {
    console.error("Checking a shopper's account:", error);
    return "unavailable";
  }
}

export async function requestAccountDeletion(
  appProjectId: string,
  token: string,
  input: AccountDeletionInput,
): Promise<DeletionResult> {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: { shop: { select: { shopDomain: true, uninstalledAt: true } } },
  });
  if (!project || project.shop.uninstalledAt) return { status: 404 };
  // What phones see: shopper accounts on, and the storefront they sign in to.
  const settings = await loadLiveSettings(appProjectId);
  if (!settings || !accountClientId(settings)) return { status: 404 };

  const customerId = await customerOf(settings, token);
  if (customerId === "unavailable") return { status: 503 };
  if (!customerId) return { status: 401 };

  try {
    const { admin } = await unauthenticated.admin(project.shop.shopDomain);
    const response = await admin.graphql(ERASE_MUTATION, {
      variables: { customerId },
    });
    const body = (await response.json()) as EraseData;
    const result = body.data?.customerRequestDataErasure;
    if (!result || body.errors || result.userErrors.length > 0) {
      console.error(
        `Erasing a customer for app ${appProjectId}:`,
        JSON.stringify(body.errors ?? result?.userErrors ?? null),
      );
      return { status: 503 };
    }
  } catch (error) {
    // Includes a store that hasn't granted write_customer_data_erasure.
    console.error(`Erasing a customer for app ${appProjectId}:`, error);
    return { status: 503 };
  }

  const request = await db.$transaction(async (tx) => {
    await tx.accountDeletion.deleteMany({
      where: { appProjectId, customerId },
    });
    return tx.accountDeletion.create({
      data: { appProjectId, customerId, installId: input.installId ?? null },
    });
  });
  return { status: 200, requestedAt: request.requestedAt.toISOString() };
}

// A request per token at most this often: a phone sends one, and a retry on failure.
const MAX_PER_HOUR = 5;
const recent = new Map<string, { count: number; since: number }>();

// A simple limit per token, kept in memory (enough for one server), by the token's hash.
export function tooManyDeletions(token: string, now: number) {
  const key = createHash("sha256").update(token).digest("hex");
  const entry = recent.get(key);
  if (!entry || now - entry.since > 60 * 60_000) {
    recent.set(key, { count: 1, since: now });
    if (recent.size > 10_000) recent.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_HOUR;
}

// Shopify's customers/redact webhook for a store: the customer is erased. The phones that
// asked hear so, when they have notifications on and the store has its push keys, and Appsy
// forgets the requests.
export async function customerErased(
  shopDomain: string,
  customerNumber: unknown,
) {
  if (typeof customerNumber !== "number" && typeof customerNumber !== "string")
    return;
  const customerId = `gid://shopify/Customer/${customerNumber}`;
  if (!CUSTOMER_ID.test(customerId)) return;
  const requests = await db.accountDeletion.findMany({
    where: { customerId, appProject: { shop: { shopDomain } } },
    select: {
      id: true,
      installId: true,
      appProject: { select: { id: true, appName: true, iosBundleId: true } },
    },
  });
  for (const request of requests) {
    if (request.installId) {
      await tellPhone(request.appProject, request.installId).catch((error) =>
        console.error("Telling a phone its account was deleted:", error),
      );
    }
  }
  await db.accountDeletion.deleteMany({
    where: { id: { in: requests.map((request) => request.id) } },
  });
}

async function tellPhone(
  project: { id: string; appName: string; iosBundleId: string | null },
  installId: string,
) {
  const phone = await db.pushDevice.findUnique({
    where: { appProjectId_installId: { appProjectId: project.id, installId } },
    select: { token: true, platform: true },
  });
  if (!phone) return;
  const platform = phone.platform === "ios" ? "ios" : "android";
  const senders = sendersFor(
    await getStoreKeys(project.id),
    project.iosBundleId,
  );
  const sender = senders[platform];
  try {
    await sender?.deliver(phone.token, {
      title: project.appName,
      body: "Your account has been deleted, as you asked.",
      imageUrl: null,
      data: {},
    });
  } finally {
    for (const each of Object.values(senders)) each.close();
  }
}

async function forgetOldRequests() {
  await db.accountDeletion.deleteMany({
    where: {
      requestedAt: {
        lt: new Date(Date.now() - ACCOUNT_DELETION_KEEP_DAYS * DAY_MS),
      },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var appsyAccountDeletionCleanTimer: NodeJS.Timeout | undefined;
}

if (!globalThis.appsyAccountDeletionCleanTimer) {
  const clean = () =>
    void forgetOldRequests().catch((error) =>
      console.error("Deleting old account deletion requests:", error),
    );
  globalThis.appsyAccountDeletionCleanTimer = setInterval(clean, DAY_MS);
  globalThis.appsyAccountDeletionCleanTimer.unref();
  setTimeout(clean, 3 * 60_000).unref();
}
