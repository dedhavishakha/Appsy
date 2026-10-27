import type { AnalyticsEventName } from "./analytics";

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

// The section a store adds to its privacy policy, as plain text to paste into Shopify. It
// holds for every design: what depends on a setting (exchange rates, the wishlist) only
// happens when the shopper uses it.
export function appPolicyText(appName: string): string {
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
      "stores the usage data for us.",
    ],
    [
      "Security. The app sends data only over encrypted connections (HTTPS). Stored usage data",
      "can be reached only by the Scopegen staff who run Appsy.",
    ],
    [
      "How long we keep it. Usage data is deleted",
      `${USAGE_DATA_KEEP_MONTHS} months after it's collected.`,
    ],
    [
      "Questions. To ask about your data or to ask us to delete it, contact us using the",
      "details in this policy.",
    ],
  ];
  return paragraphs.map((lines) => lines.join(" ")).join("\n\n");
}

// Google's names for the purposes Appsy's answers use (Data safety form).
export type DataSafetyPurpose = "Analytics" | "App functionality";

// One data type to tick in the Data safety form. All of them are collected, none shared:
// Appsy and Shopify handle the data for the store as service providers, which Google
// doesn't count as sharing, and none of it is processed ephemerally.
export type DataSafetyItem = {
  category: string;
  type: string;
  what: string;
  purpose: DataSafetyPurpose;
  // Shoppers can choose whether it's collected (the usage data question in the app).
  optional: boolean;
};

// What shoppers give at checkout: Shopify's checkout, opened from the bag in the phone's
// browser. Google's help doesn't cover that case, so Appsy's answers include it (decided
// 2026-10-27).
const atCheckout = (category: string, type: string, what: string): DataSafetyItem => ({
  category,
  type,
  what,
  purpose: "App functionality",
  optional: false,
});

// In the order Play Console lists them under Data types, so stores can tick them from the top.
export const DATA_SAFETY_ITEMS: DataSafetyItem[] = [
  atCheckout("Personal info", "Name", "Entered at checkout."),
  atCheckout("Personal info", "Email address", "Entered at checkout."),
  atCheckout("Personal info", "Address", "The delivery address entered at checkout."),
  atCheckout("Personal info", "Phone number", "Entered at checkout, if the checkout asks for it."),
  atCheckout(
    "Financial info",
    "User payment info",
    "Card or other payment details entered at checkout.",
  ),
  atCheckout("Financial info", "Purchase history", "The bag and the order placed at checkout."),
  {
    category: "App activity",
    type: "App interactions",
    what: `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times.`,
    purpose: "Analytics",
    optional: true,
  },
  {
    category: "App activity",
    type: "In-app search history",
    what: "The words shoppers search for, sent to Shopify to find products.",
    purpose: "App functionality",
    optional: false,
  },
  {
    category: "Device or other IDs",
    type: "Device or other IDs",
    what: "The random ID the app creates when the shopper allows usage data.",
    purpose: "Analytics",
    optional: true,
  },
];
