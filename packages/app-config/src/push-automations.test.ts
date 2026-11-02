import { describe, expect, it } from "vitest";
import {
  AUTOMATION_TEMPLATES,
  automationWhen,
  fillAutomationText,
  PLACEHOLDER_NAME_MAX,
  pushAutomationInput,
  pushData,
  pushOpenedInput,
  pushStateInput,
  quietUntil,
} from "./index";

describe("automatic notification templates", () => {
  it("are valid as merchants would save them, with only the first bag reminder on", () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(pushAutomationInput.safeParse({ ...template, image: null }).success).toBe(true);
    }
    expect(AUTOMATION_TEMPLATES.filter((template) => template.enabled).map((t) => t.template)).toEqual(
      ["abandoned_bag"],
    );
    expect(new Set(AUTOMATION_TEMPLATES.map((template) => template.template)).size).toBe(
      AUTOMATION_TEMPLATES.length,
    );
  });

  it("say when they send", () => {
    expect(automationWhen("abandoned_bag", 1)).toBe("1 hour after the bag last changed");
    expect(automationWhen("abandoned_bag", 24)).toBe("24 hours after the bag last changed");
    expect(automationWhen("wishlist", 3)).toBe("3 days after a product is saved to the wishlist");
  });
});

describe("what merchants write", () => {
  const base = {
    kind: "abandoned_bag",
    name: "Bag",
    enabled: true,
    delay: 4,
    title: "Your bag",
    body: "{product} is waiting at {store}.",
    imageMode: "product",
    image: null,
  };

  it("keeps waits within each kind's limits", () => {
    expect(pushAutomationInput.safeParse({ ...base, delay: 0 }).success).toBe(false);
    expect(pushAutomationInput.safeParse({ ...base, delay: 73 }).success).toBe(false);
    expect(pushAutomationInput.safeParse({ ...base, kind: "wishlist", delay: 30 }).success).toBe(
      true,
    );
    expect(pushAutomationInput.safeParse({ ...base, kind: "wishlist", delay: 31 }).success).toBe(
      false,
    );
  });

  it("allows only the known placeholders, and a picture only when one is chosen", () => {
    expect(pushAutomationInput.safeParse({ ...base, title: "Hi {name}" }).success).toBe(false);
    expect(pushAutomationInput.safeParse({ ...base, imageMode: "file" }).success).toBe(false);
    expect(pushAutomationInput.safeParse({ ...base, name: " " }).success).toBe(false);
  });

  it("fills in the product's and app's names, shortening long product names", () => {
    expect(fillAutomationText("{product} is at {store}", { product: "Tee", store: "Noodle" })).toBe(
      "Tee is at Noodle",
    );
    const long = "A".repeat(80);
    const filled = fillAutomationText("{product}", { product: long, store: "S" });
    expect(filled.length).toBe(PLACEHOLDER_NAME_MAX);
    expect(filled.endsWith("…")).toBe(true);
  });
});

describe("what phones send", () => {
  const state = {
    installId: "3f9a0c12-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    bag: { cartId: "gid://shopify/Cart/c1-abc?key=xyz", changedAt: "2026-11-02T10:00:00.000Z" },
    wishlist: [{ productId: "gid://shopify/Product/7", savedAt: null }],
    utcOffset: 330,
  };

  it("checks the bag, the wishlist and the clock offset", () => {
    expect(pushStateInput.safeParse(state).success).toBe(true);
    expect(pushStateInput.safeParse({ ...state, bag: null, wishlist: [] }).success).toBe(true);
    expect(
      pushStateInput.safeParse({ ...state, bag: { ...state.bag, cartId: "javascript:x" } }).success,
    ).toBe(false);
    expect(
      pushStateInput.safeParse({ ...state, wishlist: [{ productId: "7", savedAt: null }] }).success,
    ).toBe(false);
    expect(pushStateInput.safeParse({ ...state, utcOffset: 900 }).success).toBe(false);
  });

  it("counts a tap on one campaign or one automatic notification", () => {
    const id = "6f2c1d4e-8a3b-4c5d-9e6f-7a8b9c0d1e2f";
    expect(pushOpenedInput.safeParse({ campaign: id }).success).toBe(true);
    expect(pushOpenedInput.safeParse({ automation: id }).success).toBe(true);
    expect(pushOpenedInput.safeParse({}).success).toBe(false);
    expect(pushOpenedInput.safeParse({ campaign: id, automation: id }).success).toBe(false);
    expect(pushData.parse({ automation: id, bag: true })).toEqual({ automation: id, bag: true });
  });
});

describe("quiet hours", () => {
  // India is 330 minutes ahead of UTC.
  it("let daytime through and hold night-time until 09:00 where the phone is", () => {
    expect(quietUntil(new Date("2026-11-02T06:00:00Z"), 330)).toBeNull(); // 11:30 in India
    expect(quietUntil(new Date("2026-11-02T16:00:00Z"), 330)?.toISOString()).toBe(
      "2026-11-03T03:30:00.000Z", // 21:30 → 09:00 the next morning
    );
    expect(quietUntil(new Date("2026-11-02T20:00:00Z"), 330)?.toISOString()).toBe(
      "2026-11-03T03:30:00.000Z", // 01:30 → 09:00 the same morning
    );
    expect(quietUntil(new Date("2026-11-02T14:00:00Z"), -300)).toBeNull(); // 09:00 in New York
  });
});
