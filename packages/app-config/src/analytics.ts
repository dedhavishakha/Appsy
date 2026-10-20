import { z } from "zod";
import { shopifyGid } from "./fields";

// Usage events that merchant apps send to Appsy, only after the shopper allows it (docs/04,
// section 7; docs/05). They carry ids of products, collections and variants, never names,
// emails or what the shopper typed. Each event's props are checked against its schema.
export const ANALYTICS_EVENTS = {
  // The first time a shopper allows usage data on a phone: the dashboard's installs.
  first_open: z.object({}),
  // Each time the app comes to the front after a break (a new session).
  app_open: z.object({}),
  product_view: z.object({ productId: shopifyGid("Product") }),
  collection_view: z.object({ collectionId: shopifyGid("Collection") }),
  search: z.object({}),
  add_to_cart: z.object({
    variantId: shopifyGid("ProductVariant"),
    quantity: z.number().int().min(1).max(999),
  }),
  checkout_started: z.object({ items: z.number().int().min(0).max(9999) }),
  wishlist_add: z.object({ productId: shopifyGid("Product") }),
};

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsProps<Name extends AnalyticsEventName> = z.input<
  (typeof ANALYTICS_EVENTS)[Name]
>;

export const MAX_EVENTS_PER_BATCH = 100;
// Phones keep events while offline; older ones aren't worth counting.
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Allows for phones whose clock runs a little fast.
const MAX_CLOCK_AHEAD_MS = 24 * 60 * 60 * 1000;

const eventSchema = z.object({
  name: z.string().min(1).max(64),
  props: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.iso.datetime({ offset: true }),
  sessionId: z.string().min(1).max(64),
});

// One request from a phone: its random install id and up to 100 events.
export const analyticsBatchSchema = z.object({
  deviceId: z.uuid(),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type AnalyticsBatch = z.output<typeof analyticsBatchSchema>;
export type CheckedEvent = {
  name: AnalyticsEventName;
  props: Record<string, unknown>;
  sessionId: string;
  occurredAt: Date;
};

// An event Appsy keeps, or null for one it drops: a name this version doesn't know (a newer
// phone), props that don't match, or a time too far off. Dropping, not refusing, keeps the
// rest of a phone's batch.
export function checkAnalyticsEvent(
  event: AnalyticsBatch["events"][number],
  now = Date.now(),
): CheckedEvent | null {
  if (!Object.hasOwn(ANALYTICS_EVENTS, event.name)) return null;
  const name = event.name as AnalyticsEventName;
  const props = ANALYTICS_EVENTS[name].safeParse(event.props);
  const occurredAt = new Date(event.occurredAt);
  const time = occurredAt.getTime();
  if (!props.success || time < now - MAX_EVENT_AGE_MS || time > now + MAX_CLOCK_AHEAD_MS) {
    return null;
  }
  return { name, props: props.data, sessionId: event.sessionId, occurredAt };
}
