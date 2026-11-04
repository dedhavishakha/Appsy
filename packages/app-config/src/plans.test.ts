import { describe, expect, it } from "vitest";
import {
  cheapestPlanFor,
  cheapestPlanWith,
  hasPerk,
  onPlan,
  planHandleFrom,
  PLANS,
  plansFrom,
  upgradeFor,
} from "./plans";

describe("plans", () => {
  it("go from the cheapest up, each with what the one below has", () => {
    expect(PLANS.map((plan) => [plan.name, plan.monthlyUsd])).toEqual([
      ["Standard", 100],
      ["Pro", 220],
      ["Advanced", 450],
    ]);
    for (const [index, plan] of PLANS.entries()) {
      for (const perk of PLANS[index - 1]?.perks ?? []) {
        expect(plan.perks).toContain(perk);
      }
    }
  });

  // Standard is Android only; Pro adds iPhone, automatic notifications and currency; Advanced
  // adds dedicated support.
  it("give each plan its perks", () => {
    expect(hasPerk("standard", "iphone")).toBe(false);
    expect(hasPerk("standard", "automations")).toBe(false);
    expect(hasPerk("pro", "iphone")).toBe(true);
    expect(hasPerk("pro", "currency")).toBe(true);
    expect(hasPerk("pro", "dedicatedSupport")).toBe(false);
    expect(hasPerk("advanced", "dedicatedSupport")).toBe(true);
    expect(hasPerk("unlimited", "dedicatedSupport")).toBe(true);
  });

  it("read Shopify's plan handles", () => {
    expect(planHandleFrom("standard")).toBe("standard");
    expect(planHandleFrom("pro_plan")).toBe("pro");
    expect(planHandleFrom("Advanced-Monthly")).toBe("advanced");
    // "pro" only as a word of its own.
    expect(planHandleFrom("product-test")).toBeNull();
    expect(planHandleFrom("test")).toBeNull();
  });

  it("say which plans a package is on, and the cheapest for a locked feature", () => {
    expect(onPlan("all", "standard")).toBe(true);
    expect(onPlan(["advanced"], "pro")).toBe(false);
    expect(onPlan(["advanced"], "unlimited")).toBe(true);
    expect(cheapestPlanFor(["pro", "advanced"]).name).toBe("Pro");
    expect(cheapestPlanFor(["advanced"]).name).toBe("Advanced");
    expect(cheapestPlanWith("iphone").name).toBe("Pro");
  });

  it("say which plan to move up to", () => {
    expect(upgradeFor("standard", "iphone")).toBe("pro");
    expect(upgradeFor("pro", "iphone")).toBeNull();
    expect(upgradeFor("pro", { plans: ["advanced"] })).toBe("advanced");
    expect(upgradeFor("advanced", { plans: ["advanced"] })).toBeNull();
    expect(upgradeFor("unlimited", "dedicatedSupport")).toBeNull();
    expect(upgradeFor(null, { plans: "all" })).toBe("standard");
    expect(plansFrom("pro")).toBe("Pro and Advanced");
    expect(plansFrom("advanced")).toBe("Advanced");
    expect(plansFrom("standard")).toBe("Standard, Pro and Advanced");
  });
});
