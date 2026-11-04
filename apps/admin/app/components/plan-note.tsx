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
