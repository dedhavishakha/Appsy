import { z } from "zod";
import { shopifyGid } from "./fields";
import { imageValue } from "./inputs";
import { pushBody, pushTitle } from "./push";

// Automatic notifications (docs/03, section I2; decided 2026-11-02): templates each merchant
// switches on or off and edits, and their own made from the same kinds. Appsy's server sends
// them with the store's keys (admin models/push-automations.server.ts), with the product's
// name and, on Android, its picture. Phones share what they need only after the shopper
// allows notifications (pushStateInput).

export const AUTOMATION_KINDS = ["abandoned_bag", "wishlist"] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

type KindRules = {
  // What merchants pick when they make their own.
  label: string;
  // The wait before it sends, and its limits.
  unit: "hours" | "days";
  min: number;
  max: number;
};

export const AUTOMATION_RULES: Record<AutomationKind, KindRules> = {
  abandoned_bag: { label: "Abandoned bag", unit: "hours", min: 1, max: 72 },
  wishlist: { label: "Wishlist reminder", unit: "days", min: 1, max: 30 },
};

// When it sends, in the merchant's words.
export function automationWhen(kind: AutomationKind, delay: number): string {
  const unit = AUTOMATION_RULES[kind].unit === "hours" ? "hour" : "day";
  const wait = `${delay} ${unit}${delay === 1 ? "" : "s"}`;
  return kind === "abandoned_bag"
    ? `${wait} after the bag last changed`
    : `${wait} after a product is saved to the wishlist`;
}

export const AUTOMATION_IMAGE_MODES = ["product", "file", "none"] as const;
export type AutomationImageMode = (typeof AUTOMATION_IMAGE_MODES)[number];

// The ready-made ones every store gets, each made once (`template`). Only the first bag
// reminder starts on, as the phone's bag reminder did.
export const AUTOMATION_TEMPLATES = [
  {
    template: "abandoned_bag",
    kind: "abandoned_bag",
    name: "Abandoned bag",
    enabled: true,
    delay: 4,
    title: "Your bag is waiting",
    body: "{product} is still in your bag.",
    imageMode: "product",
  },
  {
    template: "abandoned_bag_2",
    kind: "abandoned_bag",
    name: "Abandoned bag, second reminder",
    enabled: false,
    delay: 24,
    title: "Still thinking about {product}?",
    body: "Your bag is saved. Come back and finish your order.",
    imageMode: "product",
  },
  {
    template: "wishlist",
    kind: "wishlist",
    name: "Wishlist reminder",
    enabled: false,
    delay: 3,
    title: "Still on your wishlist",
    body: "{product} is waiting for you.",
    imageMode: "product",
  },
] as const satisfies readonly {
  template: string;
  kind: AutomationKind;
  name: string;
  enabled: boolean;
  delay: number;
  title: string;
  body: string;
  imageMode: AutomationImageMode;
}[];

export type AutomationTemplate = (typeof AUTOMATION_TEMPLATES)[number]["template"];

// What merchants can put in braces: the product's name and the app's name.
export const AUTOMATION_PLACEHOLDERS = ["product", "store"] as const;
// A product's name in a notification, cut short so the text still fits on a phone.
export const PLACEHOLDER_NAME_MAX = 40;

const onlyKnownPlaceholders = (text: string) =>
  [...text.matchAll(/\{([^}]*)\}/g)].every((match) =>
    (AUTOMATION_PLACEHOLDERS as readonly string[]).includes(match[1] ?? ""),
  );
const PLACEHOLDER_HELP = "Use only {product} and {store} in braces.";

const shorten = (name: string) => {
  const trimmed = name.trim();
  return trimmed.length > PLACEHOLDER_NAME_MAX
    ? `${trimmed.slice(0, PLACEHOLDER_NAME_MAX - 1).trimEnd()}…`
    : trimmed;
};

// A title or message with the product's and the app's names in place.
export function fillAutomationText(text: string, names: { product: string; store: string }) {
  return text.replace(/\{(product|store)\}/g, (_, key: string) =>
    key === "product" ? shorten(names.product) : names.store.trim(),
  );
}

// One automation as the merchant writes it (admin routes/app.push.automations.$id.tsx).
export const pushAutomationInput = z
  .object({
    kind: z.enum(AUTOMATION_KINDS),
    name: z.string().trim().min(1, "Add a name.").max(60, "Keep the name to 60 characters."),
    enabled: z.boolean(),
    delay: z.number().int(),
    title: pushTitle.refine(onlyKnownPlaceholders, PLACEHOLDER_HELP),
    body: pushBody.refine(onlyKnownPlaceholders, PLACEHOLDER_HELP),
    imageMode: z.enum(AUTOMATION_IMAGE_MODES),
    // From the store's Shopify Files, when imageMode is "file".
    image: imageValue.nullable(),
  })
  .superRefine((input, context) => {
    const rules = AUTOMATION_RULES[input.kind];
    if (input.delay < rules.min || input.delay > rules.max) {
      context.addIssue({
        code: "custom",
        path: ["delay"],
        message: `Choose ${rules.min} to ${rules.max} ${rules.unit}.`,
      });
    }
    if (input.imageMode === "file" && !input.image) {
      context.addIssue({
        code: "custom",
        path: ["image"],
        message: "Choose a picture, or another picture option.",
      });
    }
  });
export type PushAutomationInput = z.output<typeof pushAutomationInput>;

// What a phone tells Appsy for automatic notifications, only while the shopper allows
// notifications (admin routes/api.push.$appId_.state.tsx): its bag at the store (Shopify's
// cart ID, which Appsy reads only to write a reminder) and when it last changed, the products
// on its wishlist and when each was saved (unknown for ones saved before 2026-11-02), and how
// far its clock is from UTC, so reminders wait for the morning.
export const PUSH_WISHLIST_MAX = 100;
export const pushStateInput = z.object({
  installId: z.uuid(),
  bag: z
    .object({
      cartId: z.string().startsWith("gid://shopify/Cart/").max(500),
      changedAt: z.iso.datetime(),
    })
    .nullable(),
  wishlist: z
    .array(
      z.object({
        productId: shopifyGid("Product"),
        savedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(PUSH_WISHLIST_MAX),
  // Minutes ahead of UTC, like India's 330.
  utcOffset: z.number().int().min(-720).max(840),
});
export type PushStateInput = z.output<typeof pushStateInput>;

// Automatic notifications wait out the night where the phone is: none from 21:00 to 09:00.
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 9;

// When sending may start again for a phone `utcOffset` minutes ahead of UTC, or null when
// it's daytime there now.
export function quietUntil(now: Date, utcOffset: number): Date | null {
  const local = new Date(now.getTime() + utcOffset * 60_000);
  const hour = local.getUTCHours();
  if (hour >= QUIET_UNTIL_HOUR && hour < QUIET_FROM_HOUR) return null;
  const morning = new Date(local);
  morning.setUTCHours(QUIET_UNTIL_HOUR, 0, 0, 0);
  if (hour >= QUIET_FROM_HOUR) morning.setUTCDate(morning.getUTCDate() + 1);
  return new Date(morning.getTime() - utcOffset * 60_000);
}
