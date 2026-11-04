import { bagReminderOf, savedPushSettings, setPushSettings } from "./push";
import type { AppDesign } from "./design";
import type { Catalog } from "./manifest";
import { switchFeature } from "./validate";

// Appsy's plans (decided 2026-11-04), sold through Shopify App Pricing: Shopify shows the
// plans, runs the trial and bills the store; Appsy only reads which plan a store has (admin
// models/plans.server.ts). The prices and the trial are set in the Partner Dashboard and kept
// here only for the words Appsy shows. A feature package's manifest lists the plans it's on
// (`plans`); everything else a plan unlocks is a perk below.

export const PLAN_HANDLES = ["standard", "pro", "advanced"] as const;
export type PlanHandle = (typeof PLAN_HANDLES)[number];

// iPhone apps (Android is on every plan), automatic notifications, currency conversion, and
// a dedicated support contact. Push campaigns, builds and the other features are on every
// plan, without limits.
export const PLAN_PERKS = ["iphone", "automations", "currency", "dedicatedSupport"] as const;
export type PlanPerk = (typeof PLAN_PERKS)[number];

export type Plan = {
  handle: PlanHandle;
  name: string;
  monthlyUsd: number;
  perks: readonly PlanPerk[];
};

// Cheapest first.
export const PLANS: readonly Plan[] = [
  { handle: "standard", name: "Standard", monthlyUsd: 100, perks: [] },
  { handle: "pro", name: "Pro", monthlyUsd: 220, perks: ["iphone", "automations", "currency"] },
  {
    handle: "advanced",
    name: "Advanced",
    monthlyUsd: 450,
    perks: ["iphone", "automations", "currency", "dedicatedSupport"],
  },
];

export const TRIAL_DAYS = 21;

// What a store can use: its plan, or "unlimited" while Appsy's billing isn't set up (no
// Partner API key on the server), when everything works as it did before plans.
export type PlanAccess = PlanHandle | "unlimited";

export function planOf(handle: PlanHandle): Plan {
  return PLANS.find((plan) => plan.handle === handle) ?? PLANS[0]!;
}

// The Appsy plan a Shopify plan handle stands for: the handle itself, or a handle that has
// the plan's name as a word ("pro_plan", "advanced-monthly"). Null for any other handle.
export function planHandleFrom(handle: string): PlanHandle | null {
  const words = handle.toLowerCase().split(/[^a-z0-9]+/);
  return PLAN_HANDLES.find((plan) => words.includes(plan)) ?? null;
}

export function hasPerk(access: PlanAccess, perk: PlanPerk): boolean {
  return access === "unlimited" || planOf(access).perks.includes(perk);
}

// Whether a package listing these plans (its manifest's `plans`) is on the store's plan.
export function onPlan(plans: "all" | readonly string[], access: PlanAccess): boolean {
  return access === "unlimited" || plans === "all" || plans.includes(access);
}

// The cheapest plan with a perk, or with a package listing these plans: what a locked
// feature shows ("Available on Pro").
export function cheapestPlanWith(perk: PlanPerk): Plan {
  return PLANS.find((plan) => plan.perks.includes(perk)) ?? PLANS[PLANS.length - 1]!;
}

export function cheapestPlanFor(plans: "all" | readonly string[]): Plan {
  return PLANS.find((plan) => onPlan(plans, plan.handle)) ?? PLANS[PLANS.length - 1]!;
}

// The plan to move up to for something the store's plan doesn't include (a perk, or a
// package's manifest `plans`), or null when it's included.
export function upgradeFor(
  access: PlanAccess | null,
  needs: PlanPerk | { plans: "all" | readonly string[] },
): PlanHandle | null {
  if (typeof needs === "string") {
    return access && hasPerk(access, needs) ? null : cheapestPlanWith(needs).handle;
  }
  return access && onPlan(needs.plans, access) ? null : cheapestPlanFor(needs.plans).handle;
}

// "Pro and Advanced": a plan and the ones above it.
export function plansFrom(handle: PlanHandle): string {
  const names = PLANS.slice(PLANS.findIndex((plan) => plan.handle === handle)).map(
    (plan) => plan.name,
  );
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
}

// The design phones get on a plan: features the plan doesn't include are off, with their tabs
// and buttons, and their settings kept, so they come back as they were after an upgrade. The
// design the merchant edits keeps them on.
export function designForPlan(
  design: AppDesign,
  access: PlanAccess,
  catalog: Catalog,
): AppDesign {
  if (access === "unlimited") return design;
  let result = design;
  for (const [id, entry] of Object.entries(design.features)) {
    const manifest = catalog.get("feature", id);
    if (entry.enabled && manifest && !onPlan(manifest.plans, access)) {
      result = switchFeature(result, id, false);
    }
  }
  if (!hasPerk(access, "currency") && result.markets.displayCurrencyConversion) {
    result = { ...result, markets: { ...result.markets, displayCurrencyConversion: false } };
  }
  // App builds from before 2026-11-02 schedule their own bag reminder, an automatic
  // notification.
  const reminder = bagReminderOf(result);
  if (!hasPerk(access, "automations") && reminder) {
    result = setPushSettings(result, {
      ...savedPushSettings(result),
      bagReminder: { ...reminder, enabled: false },
    });
  }
  return result;
}
