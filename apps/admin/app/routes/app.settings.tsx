import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { hasPerk, planOf } from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { usePlansHref } from "../components/plan-note";
import { savedStorePlan } from "../models/plans.server";
import { ensureShopSetup } from "../models/shop.server";

// Settings: the store's Appsy plan, how to reach Scopegen, and Appsy's own terms and
// privacy. The switches for what the merchant's app does are on the Functionality page.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const { access, trialEndsAt } = savedStorePlan(shop);
  // Shopify shows the plans and bills the store (models/plans.server.ts); while billing isn't
  // set up there's no plan to show.
  const plan = access && access !== "unlimited" ? planOf(access) : null;
  // Where merchants get help: Advanced stores have a dedicated contact for support and setup
  // help, others the support email (set on Appsy's server).
  const dedicated =
    plan && hasPerk(plan.handle, "dedicatedSupport")
      ? (process.env.APPSY_DEDICATED_SUPPORT ?? null)
      : null;
  return {
    plan: plan && {
      name: plan.name,
      monthlyUsd: plan.monthlyUsd,
      trialEndsAt,
    },
    support: dedicated
      ? { contact: dedicated, dedicated: true }
      : process.env.APPSY_SUPPORT_EMAIL
        ? { contact: process.env.APPSY_SUPPORT_EMAIL, dedicated: false }
        : null,
  };
};

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function Settings() {
  const { plan, support } = useLoaderData<typeof loader>();
  const plansHref = usePlansHref();

  return (
    <s-page heading="Settings">
      {plan && (
        <s-section heading="Your plan">
          <s-stack gap="small">
            <s-paragraph>
              <s-text type="strong">{plan.name}</s-text>, {plan.monthlyUsd} USD
              a month, billed by Shopify.
            </s-paragraph>
            {plan.trialEndsAt && (
              <s-paragraph>
                Your free trial ends on {dateOf(plan.trialEndsAt)}.
              </s-paragraph>
            )}
            {plansHref && (
              <s-stack direction="inline">
                <s-button href={plansHref}>Change plan</s-button>
              </s-stack>
            )}
          </s-stack>
        </s-section>
      )}

      {support && (
        <s-section heading="Support">
          <s-paragraph>
            {support.dedicated
              ? "Your dedicated contact for support and setup help: "
              : "Email us for help: "}
            {/^https:\/\//.test(support.contact) ? (
              <s-link href={support.contact} target="_blank">
                {support.contact}
              </s-link>
            ) : (
              <s-link href={`mailto:${support.contact}`}>
                {support.contact}
              </s-link>
            )}
          </s-paragraph>
        </s-section>
      )}

      {/* Always reachable here as well as on Home, opening in a new window (5.7.7); the
          commission line repeats Home's (5.7.6). */}
      <s-section heading="Terms and privacy">
        <s-stack gap="small">
          <s-paragraph>
            Appsy doesn&apos;t take a commission on sales made through your app.
          </s-paragraph>
          <s-link href="/terms" target="_blank">
            Terms and conditions
          </s-link>
          <s-link href="/privacy" target="_blank">
            Privacy policy
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
