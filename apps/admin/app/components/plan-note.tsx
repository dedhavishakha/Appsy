import type { ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import { plansFrom, type PlanHandle } from "@appsy/app-config";

// Shopify's plan page as a shopify:admin link, from Appsy's main loader (routes/app.tsx).
// App Bridge opens it in the Shopify admin, outside Appsy's frame.
export function usePlansHref(): string | undefined {
  const data = useRouteLoaderData("routes/app") as
    { plansHref?: string } | undefined;
  return data?.plansHref;
}

// When Shopify will end the store's plan, from the plan check in Appsy's main loader, which
// runs fresh when Appsy opens (so it's right on the first page after a reinstall).
export function usePlanEndsAt(): string | null {
  const data = useRouteLoaderData("routes/app") as
    { planEndsAt?: string | null } | undefined;
  return data?.planEndsAt ?? null;
}

// A plan date as merchants read it, in UTC so the server and the browser show the same day.
export const planDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

// The store's plan is ending: Shopify keeps a cancelled plan (an uninstall cancels it) until its
// period ends, so a store that reinstalls gets straight in. This asks it to choose a plan
// again, as App Store requirement 1.2.2 asks on reinstall (models/plans.server.ts).
export function PlanEnding({ endsAt }: { endsAt: string }) {
  const plansHref = usePlansHref();
  return (
    <s-banner
      tone="warning"
      heading={`Your Appsy plan ends on ${planDate(endsAt)}`}
    >
      <s-paragraph>
        Choose a plan to keep using Appsy after that date.
      </s-paragraph>
      {plansHref && (
        <s-button slot="secondary-actions" variant="secondary" href={plansHref}>
          Choose plan
        </s-button>
      )}
    </s-banner>
  );
}

// In place of a feature the store's plan doesn't include: which plans have it, and the way to
// Shopify's plan page, where the merchant moves up themselves (App Store requirement 1.2.3).
export function PlanNote({
  plan,
  children,
}: {
  plan: PlanHandle;
  children?: ReactNode;
}) {
  const plansHref = usePlansHref();
  const plans = plansFrom(plan);
  return (
    <s-banner
      tone="info"
      heading={`On the ${plans} plan${plans.includes(" and ") ? "s" : ""}`}
    >
      {children}
      {plansHref && (
        <s-button slot="secondary-actions" variant="secondary" href={plansHref}>
          Change plan
        </s-button>
      )}
    </s-banner>
  );
}
