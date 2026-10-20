import { describe, expect, it } from "vitest";
import { analyticsBatchSchema, checkAnalyticsEvent, MAX_EVENTS_PER_BATCH } from "./index";

const now = Date.parse("2026-10-16T10:00:00Z");
const deviceId = "8f14e45f-ea8b-4a2c-9c1e-2b7d5a0c3e11";
const event = (
  name: string,
  props: Record<string, unknown> = {},
  occurredAt = "2026-10-16T09:59:00Z",
) => ({ name, props, occurredAt, sessionId: "s1" });

describe("analytics events", () => {
  it("accepts a phone's batch", () => {
    const batch = analyticsBatchSchema.safeParse({
      deviceId,
      events: [event("app_open"), event("product_view", { productId: "gid://shopify/Product/1" })],
    });
    expect(batch.success).toBe(true);
  });

  it("refuses batches without a proper install id or with too many events", () => {
    const noId = { deviceId: "phone-1", events: [event("app_open")] };
    expect(analyticsBatchSchema.safeParse(noId).success).toBe(false);
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => event("app_open"));
    expect(analyticsBatchSchema.safeParse({ deviceId, events }).success).toBe(false);
  });

  it("keeps known events and drops the rest, so the batch still counts", () => {
    const added = event("add_to_cart", { variantId: "gid://shopify/ProductVariant/7", quantity: 1 });
    expect(checkAnalyticsEvent(added, now)).toMatchObject({ name: "add_to_cart", sessionId: "s1" });
    // A newer phone's event, wrong props, an email-like value, too old, too far ahead.
    expect(checkAnalyticsEvent(event("video_play"), now)).toBeNull();
    expect(checkAnalyticsEvent(event("product_view", { productId: "snowboard" }), now)).toBeNull();
    const email = event("product_view", { productId: "someone@example.com" });
    expect(checkAnalyticsEvent(email, now)).toBeNull();
    expect(checkAnalyticsEvent(event("app_open", {}, "2026-08-01T00:00:00Z"), now)).toBeNull();
    expect(checkAnalyticsEvent(event("app_open", {}, "2026-10-18T00:00:00Z"), now)).toBeNull();
  });

  it("never keeps props an event doesn't define", () => {
    const checked = checkAnalyticsEvent(event("search", { query: "my address" }), now);
    expect(checked?.props).toEqual({});
  });
});
