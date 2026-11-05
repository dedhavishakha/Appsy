import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { currentPlan, planPageHref, planPageUrl } from "../models/plans.server";
import { ensureShopSetup } from "../models/shop.server";
import { ensureStorefrontToken } from "../models/storefront-token.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  // A store without an active Appsy plan chooses one on Shopify's plan page first, from any
  // page (models/plans.server.ts). Shopify sends it back with plan_handle, so it's asked about
  // again then.
  const plan = await currentPlan(
    admin,
    shop,
    new URL(request.url).searchParams.has("plan_handle"),
  );
  if (!plan.access) {
    return redirect(await planPageUrl(admin, session.shop), {
      target: "_top",
    });
  }
  // Created the first time the store opens Appsy. If Shopify refuses, the admin still
  // loads (merchants must always be able to disconnect) and the next page load retries.
  await ensureStorefrontToken(admin, shop).catch((error) =>
    console.error(`Storefront token for ${session.shop}:`, error),
  );

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    // Where "Change plan" goes (components/plan-note.tsx, Settings).
    plansHref: await planPageHref(admin),
    // Set when Shopify will end the store's plan, for example after a reinstall (Home's notice).
    planEndsAt: plan.endsAt,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/design">App design</s-link>
        <s-link href="/app/functionality">Functionality</s-link>
        <s-link href="/app/push">Push notifications</s-link>
        <s-link href="/app/publishing">Publishing</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
