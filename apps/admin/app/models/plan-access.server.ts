import {
  hasPerk,
  PLAN_HANDLES,
  plansFrom,
  upgradeFor,
  type PlanAccess,
  type PlanHandle,
  type PlanPerk,
} from "@appsy/app-config";
import { FEATURE_MANIFESTS } from "@appsy/features/manifests";
import db from "../db.server";

// What a store's Appsy plan allows (app-config plans.ts), from the plan saved on its Shop row
// (plans.server.ts checks it with Shopify). Kept apart from plans.server.ts so publishing
// (design.server.ts) can use it without the Partner API.

// Billing is on once the server has the Partner API details Shopify's guide names
// (https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/redirect-plan-selection-page).
// Until then every store keeps everything, as before plans.
export function billingOn(): boolean {
  return Boolean(
    process.env.SHOPIFY_PARTNER_ORG_ID &&
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN &&
    process.env.SHOPIFY_APP_GID,
  );
}

export function savedPlan(plan: string | null): PlanHandle | null {
  return PLAN_HANDLES.find((handle) => handle === plan) ?? null;
}

// The store's plan, "unlimited" while billing is off, or null when it has no active plan.
export function planAccessOf(shop: { plan: string | null }): PlanAccess | null {
  return billingOn() ? savedPlan(shop.plan) : "unlimited";
}

export async function planAccessForApp(
  appProjectId: string,
): Promise<PlanAccess | null> {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: { shop: { select: { plan: true } } },
  });
  return project ? planAccessOf(project.shop) : null;
}

// Whether the plan includes a perk; a store with no active plan has none.
export function allows(access: PlanAccess | null, perk: PlanPerk): boolean {
  return access !== null && hasPerk(access, perk);
}

// The plan to move up to for a feature package (its manifest's `plans`), or null when the
// store's plan includes it.
export function upgradeForFeature(
  access: PlanAccess | null,
  feature: string,
): PlanHandle | null {
  const manifest = FEATURE_MANIFESTS.find((each) => each.id === feature);
  return manifest ? upgradeFor(access, manifest) : null;
}

// Why something can't be switched on with the store's plan.
export const notOnPlan = (plan: PlanHandle) => {
  const plans = plansFrom(plan);
  return `This is on the ${plans} plan${plans.includes(" and ") ? "s" : ""}. Change your Appsy plan under Settings to use it.`;
};
