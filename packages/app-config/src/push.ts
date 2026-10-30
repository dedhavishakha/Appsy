import { z } from "zod";
import type { AppDesign } from "./design";
import { countryCode } from "./fields";
import { imageValue, linkValue } from "./inputs";

// Push notifications (docs/03, section I; decided 2026-10-30). Merchants send campaigns from
// Appsy's Push notifications page, straight to Google's Firebase Cloud Messaging (FCM) with
// their own Firebase project's key. Each phone schedules its own bag reminder, so Appsy keeps
// no shoppers' bags. The app asks the first time the shopper adds to their bag, and Privacy
// choices turns notifications off. Android only for now: iPhones need Apple's push service.
export const PUSH_FEATURE = "push-notifications";

// The app's one Android notification channel. The app makes it before asking for permission,
// because Android 13 and later only ask once a channel exists (expo-notifications).
// Shoppers see its name in the phone's settings.
export const PUSH_CHANNEL = "offers";
export const PUSH_CHANNEL_NAME = "Offers and reminders";

// Appsy deletes a phone's notification address once the app hasn't been opened on it for
// this long (Google's FCM expires such registrations after 270 days), or as soon as Google
// says it no longer works (admin models/push.server.ts).
export const PUSH_DEVICE_KEEP_DAYS = 270;

export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 240;
// How long Google keeps a campaign for a phone that's off or offline (FCM's `ttl`, whose own
// default of 4 weeks is too long for an offer).
export const PUSH_TTL_SECONDS = 2 * 24 * 60 * 60;
// FCM refuses messages over 4096 bytes, keys and values included.
export const FCM_MAX_BYTES = 4096;

const pushTitle = z
  .string()
  .trim()
  .min(1, "Add a title.")
  .max(PUSH_TITLE_MAX, `Keep the title to ${PUSH_TITLE_MAX} characters.`);
const pushBody = z
  .string()
  .trim()
  .min(1, "Add a message.")
  .max(PUSH_BODY_MAX, `Keep the message to ${PUSH_BODY_MAX} characters.`);

// The reminder a phone shows when its bag has waited this many hours since it last changed.
export const BAG_REMINDER_MAX_HOURS = 72;
export const bagReminderSettings = z.object({
  enabled: z.boolean(),
  hours: z.number().int().min(1).max(BAG_REMINDER_MAX_HOURS),
  title: pushTitle,
  body: pushBody,
});
export type BagReminderSettings = z.output<typeof bagReminderSettings>;

export const BAG_REMINDER_DEFAULTS: BagReminderSettings = {
  enabled: true,
  hours: 4,
  title: "Your bag is waiting",
  body: "The items you chose are still in your bag.",
};

export const pushSettings = z.object({
  bagReminder: bagReminderSettings.default(BAG_REMINDER_DEFAULTS),
});
export type PushSettings = z.output<typeof pushSettings>;

// The store's settings, kept while the feature is off so they stay the same.
export function savedPushSettings(design: Pick<AppDesign, "features">): PushSettings {
  const settings = pushSettings.safeParse(design.features[PUSH_FEATURE]?.settings ?? {});
  return settings.success ? settings.data : { bagReminder: BAG_REMINDER_DEFAULTS };
}

export function pushOn(design: Pick<AppDesign, "features">): boolean {
  return design.features[PUSH_FEATURE]?.enabled === true;
}

// The reminder phones schedule, while push notifications and the reminder are both on.
export function bagReminderOf(design: Pick<AppDesign, "features">): BagReminderSettings | null {
  const { bagReminder } = savedPushSettings(design);
  return pushOn(design) && bagReminder.enabled ? bagReminder : null;
}

// Changes the settings, keeping the feature's switch as it is.
export function setPushSettings(design: AppDesign, settings: PushSettings): AppDesign {
  return {
    ...design,
    features: { ...design.features, [PUSH_FEATURE]: { enabled: pushOn(design), settings } },
  };
}

// A campaign as the merchant writes it on Appsy's Push notifications page.
export const pushCampaignInput = z.object({
  title: pushTitle,
  body: pushBody,
  // From the store's Shopify Files; phones download a smaller copy (FCM's limit on Android is
  // 1 MB).
  image: imageValue.nullable(),
  link: linkValue.nullable(),
  // The countries shoppers chose in the app. None means every phone.
  countries: z.array(countryCode).max(250),
  // When to send it. Null sends it now.
  sendAt: z.iso.datetime().nullable(),
});
export type PushCampaignInput = z.output<typeof pushCampaignInput>;

// What a notification carries for the app: the campaign, so a tap is counted, and where the
// tap goes; or `bag` for the bag reminder. FCM sends it as `data.body`, the key
// expo-notifications reads a notification's data from.
export const pushData = z.object({
  campaign: z.uuid().optional(),
  link: linkValue.optional(),
  bag: z.literal(true).optional(),
});
export type PushData = z.output<typeof pushData>;

export type PushMessage = {
  title: string;
  body: string;
  imageUrl: string | null;
  data: PushData;
};

// The request body for FCM's HTTP v1 send
// (https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages). Google now
// marks `token` deprecated in favour of `fid` (Firebase installation IDs), but during the
// change it accepts both, and expo-notifications still gives phones registration tokens.
export function fcmRequest(target: string, message: PushMessage) {
  return {
    message: {
      token: target,
      notification: {
        title: message.title,
        body: message.body,
        ...(message.imageUrl ? { image: message.imageUrl } : {}),
      },
      data: { body: JSON.stringify(message.data) },
      android: {
        ttl: `${PUSH_TTL_SECONDS}s`,
        notification: { channel_id: PUSH_CHANNEL },
      },
    },
  };
}

// The part of a message that counts toward FCM's size limit, in UTF-8 bytes. (Counted by
// hand: this package runs in phones and the admin alike, without TextEncoder's types.)
export function pushMessageBytes(message: PushMessage): number {
  const { notification, data } = fcmRequest("", message).message;
  let bytes = 0;
  for (const character of JSON.stringify({ notification, data })) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function pushMessageFits(message: PushMessage): boolean {
  // Some room for what Google adds itself.
  return pushMessageBytes(message) <= FCM_MAX_BYTES - 256;
}

// What phones send to Appsy (the admin's routes/api.push.*): a phone that allowed
// notifications, one that turned them off, and a tap on a campaign.
export const pushDeviceInput = z.object({
  // A random ID the app makes when the shopper allows notifications.
  installId: z.uuid(),
  token: z.string().min(1).max(4096),
  platform: z.enum(["android", "ios"]),
  country: countryCode.optional(),
});
export const pushForgetInput = z.object({ installId: z.uuid() });
export const pushOpenedInput = z.object({ campaign: z.uuid() });
export type PushDeviceInput = z.output<typeof pushDeviceInput>;

// A short code for one phone, shown under Privacy choices, so store staff can send a test to
// their own phone from Appsy: the first 8 characters of its install ID, e.g. "3F9A-0C12".
export function pushTestCode(installId: string): string {
  const hex = installId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

// A typed test code as stored (lowercase, no dash), or null if it can't be one.
export function readPushTestCode(text: string): string | null {
  const hex = text.replace(/[\s-]/g, "").toLowerCase();
  return /^[0-9a-f]{8}$/.test(hex) ? hex : null;
}
