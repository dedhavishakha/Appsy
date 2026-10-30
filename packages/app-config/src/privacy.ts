import type { AnalyticsEventName } from "./analytics";
import { PUSH_DEVICE_KEEP_DAYS } from "./push";

// What every Appsy app does with shoppers' data, as merchants tell shoppers and Google: the
// section each store adds to its own privacy policy, and the answers for Google Play's Data
// safety form (docs/05, sections 7 and 9). Appsy's own policy (admin routes/privacy.tsx)
// says the same, so a change in what the app sends means a change in both.

// Appsy deletes usage events this long after they happen (admin models/usage-data.server.ts).
export const USAGE_DATA_KEEP_MONTHS = 13;

// How the policy (to shoppers) and the Data safety answers (to merchants) name each usage
// event. A new event doesn't compile until it's named in both.
const EVENT_WORDS: Record<AnalyticsEventName, { shopper: string; merchant: string }> = {
  first_open: { shopper: "opening the app", merchant: "app opens" },
  app_open: { shopper: "opening the app", merchant: "app opens" },
  product_view: { shopper: "viewing products", merchant: "product views" },
  collection_view: { shopper: "viewing collections", merchant: "collection views" },
  search: {
    shopper: "searching (but not the words you search for)",
    merchant: "searches (not the words)",
  },
  add_to_cart: { shopper: "adding to your bag", merchant: "adding to the bag" },
  checkout_started: { shopper: "starting checkout", merchant: "checkouts started" },
  wishlist_add: { shopper: "saving to your wishlist", merchant: "wishlist saves" },
};

function list(words: string[]) {
  const unique = [...new Set(words)];
  return unique.length < 2
    ? unique.join("")
    : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

const WORDS = Object.values(EVENT_WORDS);
const SHOPPER_EVENTS = list(WORDS.map((words) => words.shopper));
const MERCHANT_EVENTS = list(WORDS.map((words) => words.merchant));

export const APP_POLICY_HEADING = "Our mobile app";

// What a store's app does beyond every app: Google Analytics, when the store connects it
// (ga4.ts), and push notifications, when the store switches them on (push.ts).
export type PrivacyOptions = { googleAnalytics?: boolean; pushNotifications?: boolean };

// What the Google Analytics SDK collects by default, from Google's guidance for Google Play
// (https://support.google.com/analytics/answer/11582702): an app-instance ID, the advertising
// ID (which Appsy's apps turn off), a coarse location from the phone's masked IP address,
// and screen views and sessions.
const GOOGLE_ANALYTICS_PARAGRAPH = [
  "Google Analytics. If you allow usage data, the app also sends it to Google Analytics, run",
  "by Google, with the names and prices of the products involved and an ID Google Analytics",
  "creates for the app on your phone. Google Analytics also records app opens and sessions,",
  "and works out a rough location, such as your city, from your phone's IP address. Turning",
  "usage data off stops this; what was already sent is kept as set in our Google Analytics",
  "account.",
];

// What push notifications add (push.ts): the phone's address from Google's Firebase Cloud
// Messaging and a random ID, only once the shopper allows notifications. Bag reminders are
// scheduled on the phone, and taps are counted without saying whose.
const PUSH_PARAGRAPH = [
  "Notifications. The app asks before it sends you notifications. If you allow them, the app",
  "sends us your phone's notification address from Google's Firebase Cloud Messaging, which",
  "delivers our notifications, with a random ID the app creates and the country you shop in,",
  "so we can send you offers and news. Reminders about items left in your bag are set up on",
  "your phone: your bag isn't sent to us. We count how many people open each notification,",
  "without recording who. You can turn notifications off at any time under Privacy choices in",
  "the app's menu, which also deletes your phone's notification address from our records, or",
  "in your phone's settings.",
];

// The section a store adds to its privacy policy, as plain text to paste into Shopify. It
// holds for every design: what depends on a setting (exchange rates, the wishlist) only
// happens when the shopper uses it.
export function appPolicyText(appName: string, options: PrivacyOptions = {}): string {
  const push = options.pushNotifications === true;
  const stored = push ? "usage data and notification addresses" : "usage data";
  const paragraphs = [
    [APP_POLICY_HEADING],
    [
      `This section covers the ${appName} app for Android and iPhone.`,
      "The rest of this policy also applies to the app.",
    ],
    [
      "Usage data. The app asks before it collects usage data. If you allow it, the app sends a",
      "random ID it creates for your phone and a record of your visits and actions:",
      `${SHOPPER_EVENTS}.`,
      "Usage data doesn't include your name, your email address or anything you type, and it",
      "isn't sold or used for advertising. We use it only to understand how the app is used",
      "and to improve it.",
    ],
    [
      "Your choice. You can change your answer at any time under Privacy choices in the app's",
      "menu. If you turn usage data off, the app forgets its random ID and the usage data",
      "already sent from your phone is deleted.",
    ],
    ...(options.googleAnalytics ? [GOOGLE_ANALYTICS_PARAGRAPH] : []),
    ...(push ? [PUSH_PARAGRAPH] : []),
    [
      "Shopping. Products, search results, your bag and checkout come from our online store,",
      "which runs on Shopify. When you search, the words you type are sent to Shopify to find",
      "matching products. At checkout you enter your contact details, delivery address and",
      "payment details, which we use as described in the rest of this policy. Your wishlist is",
      "saved only on your phone.",
    ],
    [
      "Prices in other currencies. If you choose to see prices in another currency, the app",
      "downloads exchange rates from ExchangeRate-API, which sees your phone's IP address, as",
      "any website you visit does.",
    ],
    [
      "Who handles this data. The app is built and run with Appsy, a service by Scopegen, which",
      `stores the ${stored} for us.`,
    ],
    [
      `Security. The app sends data only over encrypted connections (HTTPS). Stored ${stored}`,
      "can be reached only by the Scopegen staff who run Appsy.",
    ],
    [
      "How long we keep it. Usage data is deleted",
      `${USAGE_DATA_KEEP_MONTHS} months after it's collected.`,
      ...(push
        ? [
            "A phone's notification address is deleted as soon as Google says it no longer",
            `works, or ${PUSH_DEVICE_KEEP_DAYS} days after the app was last opened on it.`,
          ]
        : []),
    ],
    [
      "Questions. To ask about your data or to ask us to delete it, contact us using the",
      "details in this policy.",
    ],
  ];
  return paragraphs.map((lines) => lines.join(" ")).join("\n\n");
}

// Google's names for the purposes Appsy's answers use (Data safety form). Google's examples
// put promotional push notifications under "Advertising or marketing" and news about the app
// or developer under "Developer communications"
// (https://support.google.com/googleplay/android-developer/answer/10787469).
export type DataSafetyPurpose =
  | "App functionality"
  | "Analytics"
  | "Developer communications"
  | "Advertising or marketing";

// One data type to tick in the Data safety form. All of them are collected, none shared:
// Appsy, Shopify and Google Analytics handle the data for the store as service providers,
// which Google doesn't count as sharing, and none of it is processed ephemerally.
export type DataSafetyItem = {
  category: string;
  type: string;
  what: string;
  purposes: DataSafetyPurpose[];
  // Shoppers can choose whether it's collected (the app's usage data and notification
  // questions).
  optional: boolean;
};

// What shoppers give at checkout: Shopify's checkout, opened from the bag in the phone's
// browser. Google's help doesn't cover that case, so Appsy's answers include it (decided
// 2026-10-27).
const atCheckout = (category: string, type: string, what: string): DataSafetyItem => ({
  category,
  type,
  what,
  purposes: ["App functionality"],
  optional: false,
});

// In the order Play Console lists them under Data types, so stores can tick them from the
// top. Google Analytics adds a rough location and analytics uses (GOOGLE_ANALYTICS_PARAGRAPH);
// push notifications add the notification address and their purposes (PUSH_PARAGRAPH).
export function dataSafetyItems(options: PrivacyOptions = {}): DataSafetyItem[] {
  const ga4 = options.googleAnalytics === true;
  const push = options.pushNotifications === true;
  const ids = ga4
    ? "The random ID the app creates, and Google Analytics' ID for the app on the phone, after the shopper allows usage data. Not the advertising ID."
    : "The random ID the app creates when the shopper allows usage data.";
  const usage = ga4
    ? `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times, sent to Appsy and Google Analytics.`
    : `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times.`;
  const purchases = atCheckout(
    "Financial info",
    "Purchase history",
    ga4
      ? "The bag and the order placed at checkout; orders also go to Google Analytics, after the shopper allows usage data."
      : "The bag and the order placed at checkout.",
  );
  return [
    ...(ga4
      ? [
          {
            category: "Location",
            type: "Approximate location",
            what: "Worked out by Google Analytics from the phone's IP address, after the shopper allows usage data.",
            purposes: ["Analytics"] as DataSafetyPurpose[],
            optional: true,
          },
        ]
      : []),
    atCheckout("Personal info", "Name", "Entered at checkout."),
    atCheckout("Personal info", "Email address", "Entered at checkout."),
    atCheckout("Personal info", "Address", "The delivery address entered at checkout."),
    atCheckout("Personal info", "Phone number", "Entered at checkout, if the checkout asks for it."),
    atCheckout(
      "Financial info",
      "User payment info",
      "Card or other payment details entered at checkout.",
    ),
    ga4 ? { ...purchases, purposes: ["App functionality", "Analytics"] } : purchases,
    {
      category: "App activity",
      type: "App interactions",
      what: push
        ? `${usage} And, after the shopper allows notifications, a count of taps on each notification, not linked to the phone.`
        : usage,
      purposes: ["Analytics"],
      optional: true,
    },
    {
      category: "App activity",
      type: "In-app search history",
      what: "The words shoppers search for, sent to Shopify to find products.",
      purposes: ["App functionality"],
      optional: false,
    },
    {
      category: "Device or other IDs",
      type: "Device or other IDs",
      what: push
        ? `${ids} And, after the shopper allows notifications, the phone's notification address from Firebase Cloud Messaging and another random ID, to send the store's offers and news.`
        : ids,
      purposes: push
        ? ["Analytics", "Developer communications", "Advertising or marketing"]
        : ["Analytics"],
      optional: true,
    },
  ];
}

export const DATA_SAFETY_ITEMS: DataSafetyItem[] = dataSafetyItems();
