import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  planHandleFrom,
  type PlanAccess,
  type PlanHandle,
} from "@appsy/app-config";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { applyPlan } from "./design.server";
import { billingOn, planAccessOf, savedPlan } from "./plan-access.server";
import type { ShopSetup } from "./shop.server";

// Appsy's plans through Shopify App Pricing, as Shopify's guide does it
// (https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/redirect-plan-selection-page):
// Shopify shows the plans, runs the 21-day trial and bills the store; Appsy never creates
// charges. Appsy asks the Partner API which plan a store has (activeSubscription), sends a
// store without one to Shopify's plan page, and keeps a confirmed plan for 5 minutes. Shopify
// sends no webhooks for plan changes, so every store's plan is checked again once a day too.
// A plan change gives the store's phones the app the new plan allows (design.server.ts).

const PARTNER_API_VERSION = "2026-07";
// Shopify's guide: "cache only a confirmed subscription for each shop, with a short expiry
// such as five minutes".
const CONFIRMED_FOR_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
// The Partner API takes four requests per second for each client.
const PAUSE_MS = 300;

const ACTIVE_SUBSCRIPTION_QUERY = `#graphql
  query AppsyActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      trialEndsAt
      items {
        handle
      }
    }
  }`;

type ActiveSubscription = {
  trialEndsAt: string | null;
  items: { handle: string }[];
};

type Subscription = { plan: PlanHandle; trialEndsAt: Date | null };

// The store's subscription, or null when it has none. Throws when the Partner API fails or
// is busy, so a paying store is never sent to the plan page by mistake.
async function activeSubscription(
  shopGid: string,
): Promise<Subscription | null> {
  const response = await fetch(
    `https://partners.shopify.com/${process.env.SHOPIFY_PARTNER_ORG_ID}/api/${PARTNER_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token":
          process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN ?? "",
      },
      body: JSON.stringify({
        query: ACTIVE_SUBSCRIPTION_QUERY,
        variables: { appId: process.env.SHOPIFY_APP_GID, shopId: shopGid },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    data?: { activeSubscription: ActiveSubscription | null };
    errors?: { message?: string }[];
  } | null;
  if (!response.ok || !body?.data || body.errors) {
    throw new Error(
      `Partner API: ${response.status} ${body?.errors?.map((error) => error.message).join("; ") ?? ""}`,
    );
  }
  const subscription = body.data.activeSubscription;
  if (!subscription) return null;
  const handles = subscription.items.map((item) => item.handle);
  const plan = handles.map(planHandleFrom).find((handle) => handle !== null);
  if (!plan) {
    // A private plan whose handle doesn't name one of Appsy's: it gets everything.
    console.error(
      `Plan handles ${handles.join(", ")} name no Appsy plan; treated as Advanced.`,
    );
  }
  return {
    plan: plan ?? "advanced",
    trialEndsAt: subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null,
  };
}

// Saves what Shopify said. Only a confirmed plan counts as checked, so a store without one is
// asked about again at once (after choosing a plan, for example).
async function savePlan(shopId: string, subscription: Subscription | null) {
  await db.shop.update({
    where: { id: shopId },
    data: {
      plan: subscription?.plan ?? null,
      planTrialEndsAt: subscription?.trialEndsAt ?? null,
      planCheckedAt: subscription ? new Date() : null,
    },
  });
}

// What the store had before plans, or before a first plan: everything phones were sent.
const accessBefore = (shop: { plan: string | null }): PlanAccess =>
  savedPlan(shop.plan) ?? "unlimited";

export type StorePlan = {
  access: PlanAccess | null;
  trialEndsAt: string | null;
};

// The store's plan when Appsy opens (routes/app.tsx): saved for up to 5 minutes, or asked
// now; `fresh` asks now (after Shopify's plan page). A plan change reaches the phones.
// Throws when Shopify can't say and there's no plan to fall back on.
export async function currentPlan(
  admin: AdminApiContext,
  shop: ShopSetup,
  fresh: boolean,
): Promise<StorePlan> {
  if (!billingOn()) return { access: "unlimited", trialEndsAt: null };
  const saved = savedPlan(shop.plan);
  const trialEndsAt = shop.planTrialEndsAt?.toISOString() ?? null;
  if (
    !fresh &&
    saved &&
    shop.planCheckedAt &&
    Date.now() - shop.planCheckedAt.getTime() < CONFIRMED_FOR_MS
  ) {
    return { access: saved, trialEndsAt };
  }
  let subscription: Subscription | null;
  try {
    subscription = await activeSubscription(shop.shopGid);
  } catch (error) {
    if (!saved) throw error;
    console.error(`Plan check for ${shop.shopDomain}:`, error);
    return { access: saved, trialEndsAt };
  }
  await savePlan(shop.id, subscription);
  if (subscription && subscription.plan !== saved) {
    await applyPlan(
      admin,
      { ...shop, plan: subscription.plan },
      accessBefore(shop),
      process.env.SHOPIFY_APP_URL ?? "",
    );
  }
  return {
    access: subscription?.plan ?? null,
    trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
  };
}

const APP_HANDLE_QUERY = `#graphql
  query AppsyAppHandle {
    currentAppInstallation {
      app {
        handle
      }
    }
  }`;

// Appsy's handle, the same for every store; Shopify's plan page address needs it.
let appHandle: string | null = null;

async function loadAppHandle(admin: AdminApiContext) {
  if (!appHandle) {
    const response = await admin.graphql(APP_HANDLE_QUERY);
    const { data } = (await response.json()) as {
      data: { currentAppInstallation: { app: { handle: string } } };
    };
    appHandle = data.currentAppInstallation.app.handle;
  }
  return appHandle;
}

// Shopify's plan page for the store, which Appsy opens outside its frame (target _top).
export async function planPageUrl(admin: AdminApiContext, shopDomain: string) {
  const storeHandle = shopDomain.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${await loadAppHandle(admin)}/pricing_plans`;
}

// The same page for links inside Appsy ("Change plan"): App Bridge opens shopify:admin
// links in the Shopify admin itself, like Home's link to Products.
export async function planPageHref(admin: AdminApiContext) {
  return `shopify://admin/charges/${await loadAppHandle(admin)}/pricing_plans`;
}

// --- The daily check ------------------------------------------------------------------

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Every installed store with a plan, asked about one by one: a downgrade, a cancellation or a
// frozen store reaches its phones even if the merchant doesn't open Appsy.
async function checkAllPlans() {
  if (!billingOn()) return;
  const shops = await db.shop.findMany({
    where: { uninstalledAt: null, plan: { not: null } },
    include: { appProject: true },
  });
  for (const shop of shops) {
    if (!shop.appProject) continue;
    await pause(PAUSE_MS);
    try {
      const subscription = await activeSubscription(shop.shopGid);
      await savePlan(shop.id, subscription);
      if (!subscription || subscription.plan === shop.plan) continue;
      const { admin } = await unauthenticated.admin(shop.shopDomain);
      const setup = { ...shop, appProject: shop.appProject };
      await applyPlan(
        admin,
        { ...setup, plan: subscription.plan },
        accessBefore(shop),
        process.env.SHOPIFY_APP_URL ?? "",
      );
    } catch (error) {
      console.error(`Daily plan check for ${shop.shopDomain}:`, error);
    }
  }
}

// The store's plan for pages that show it (Settings), without asking Shopify again.
export function savedStorePlan(shop: ShopSetup): StorePlan {
  return {
    access: planAccessOf(shop),
    trialEndsAt: shop.planTrialEndsAt?.toISOString() ?? null,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var appsyPlanCheckTimer: NodeJS.Timeout | undefined;
}

if (!globalThis.appsyPlanCheckTimer) {
  const check = () =>
    void checkAllPlans().catch((error) =>
      console.error("Checking stores' plans:", error),
    );
  globalThis.appsyPlanCheckTimer = setInterval(check, DAY_MS);
  globalThis.appsyPlanCheckTimer.unref();
  setTimeout(check, 5 * 60_000).unref();
}
