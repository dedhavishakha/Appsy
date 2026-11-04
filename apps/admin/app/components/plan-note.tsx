import type { ReactNode } from "react";
import { plansFrom, type PlanHandle } from "@appsy/app-config";

// In place of a feature the store's plan doesn't include: which plans have it, and the way to
// Shopify's plan page (routes/app.plans.tsx), where the merchant moves up themselves.
export function PlanNote({
  plan,
  children,
}: {
  plan: PlanHandle;
  children?: ReactNode;
}) {
  const plans = plansFrom(plan);
  return (
    <s-banner
      tone="info"
      heading={`On the ${plans} plan${plans.includes(" and ") ? "s" : ""}`}
    >
      {children}
      <s-button slot="secondary-actions" variant="secondary" href="/app/plans">
        Change plan
      </s-button>
    </s-banner>
  );
}
