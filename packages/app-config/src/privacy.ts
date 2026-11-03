import { ERASE_AFTER_DAYS } from "./accounts";
import type { AnalyticsEventName } from "./analytics";
import { PUSH_DEVICE_KEEP_DAYS } from "./push";

// What every Appsy app does with shoppers' data, as merchants tell shoppers, Google and
// Apple: the section each store adds to its own privacy policy, the answers for Google
// Play's Data safety form, and the answers for App Privacy in App Store Connect (docs/05,
// sections 7 and 9). Appsy's own policy (admin routes/privacy.tsx) says the same, so a
// change in what the app sends means a change in all of them.

// Appsy deletes usage events this long after they happen (admin models/usage-data.server.ts).
export const USAGE_DATA_KEEP_MONTHS = 13;

// Appsy keeps a shopper's request to delete their account until Shopify says the account is
// erased, and this long at most (admin models/account-deletion.server.ts).
export const ACCOUNT_DELETION_KEEP_DAYS = 60;

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
// (ga4.ts), push notifications, when the store switches them on (push.ts), and shopper
// accounts, likewise (accounts.ts).
export type PrivacyOptions = {
  googleAnalytics?: boolean;
  pushNotifications?: boolean;
  accounts?: boolean;
};

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

// What push notifications add (push.ts, push-automations.ts): the phone's notification
// address, from Google's Firebase Cloud Messaging on Android and Apple's push service on
// iPhones, a random ID, and for automatic reminders the bag (by its cart ID at the store) and
// the wishlist products with when each changed, and the phone's time zone; only once the
// shopper allows notifications. Taps are counted without saying whose.
const PUSH_PARAGRAPH = [
  "Notifications. The app asks before it sends you notifications. If you allow them, the app",
  "sends us your phone's notification address, with a random ID the app creates and the",
  "country you shop in, so we can send you offers and news. The address comes from the",
  "service that delivers our notifications: Google's Firebase Cloud Messaging on Android",
  "phones, and the Apple Push Notification service on iPhones. So we can remind you about",
  "items in your bag or on your wishlist, the app also tells us your bag's ID at our store and",
  "the products on your wishlist, with when each changed, and your phone's time zone, so",
  "reminders don't arrive at night. We read your bag from our store only to write a reminder.",
  "We count how many people open each notification, without recording who. You can turn",
  "notifications off at any time under Privacy choices in the app's menu, which also deletes",
  "your phone's notification address and what it told us about your bag and wishlist from our",
  "records, or in your phone's settings.",
];

// What shopper accounts add (accounts.ts): signing in on Shopify's own sign-in page, the
// sign-in kept on the phone and sent only to Shopify, the account shown from Shopify, and
// deleting the account, which goes through Appsy (the request, with the customer's number,
// kept until Shopify has erased the account).
const ACCOUNT_PARAGRAPH = [
  "Your account. You can sign in to your account at our store in the app, on Shopify's",
  "sign-in page. The app keeps your sign-in on your phone, in its secure storage, and uses it",
  "to show your orders, saved addresses and profile, which it reads from our store on Shopify,",
  "and so that checkout knows who you are. Signing out ends your sign-in. To delete your",
  "account, open the app's Account tab and choose Delete account, or contact us. The app sends",
  "the request to Appsy, which checks with Shopify who you are and asks Shopify to erase your",
  "account. Shopify erases your personal details, such as your name and addresses,",
  `${ERASE_AFTER_DAYS} days later, and keeps records of what you bought and when. Until then,`,
  `and for ${ACCOUNT_DELETION_KEEP_DAYS} days at most, Appsy keeps your customer number with`,
  "the request.",
];

// The section a store adds to its privacy policy, as plain text to paste into Shopify. It
// holds for every design: what depends on a setting (exchange rates, the wishlist) only
// happens when the shopper uses it.
export function appPolicyText(appName: string, options: PrivacyOptions = {}): string {
  const push = options.pushNotifications === true;
  const accounts = options.accounts === true;
  const stored = list([
    "usage data",
    ...(push ? ["notification addresses"] : []),
    ...(accounts ? ["account deletion requests"] : []),
  ]);
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
    ...(accounts ? [ACCOUNT_PARAGRAPH] : []),
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
            "A phone's notification address, with what it told us about its bag and wishlist, is",
            "deleted as soon as Google or Apple says the address no longer works, or",
            `${PUSH_DEVICE_KEEP_DAYS} days after the app was last opened on it.`,
          ]
        : []),
      ...(accounts
        ? [
            "An account deletion request is deleted once Shopify has erased the account, and",
            `${ACCOUNT_DELETION_KEEP_DAYS} days after it was made at the latest.`,
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
  | "Advertising or marketing"
  | "Account management";

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

// The contact details a signed-in shopper's account holds, which the app shows them
// (ACCOUNT_PARAGRAPH): Google's "Account management" purpose, "the setup or management of a
// user's account with the developer".
function withAccount(item: DataSafetyItem, what: string): DataSafetyItem {
  return {
    ...item,
    what: `${item.what} ${what}`,
    purposes: [...item.purposes, "Account management"],
  };
}

// In the order Play Console lists them under Data types, so stores can tick them from the
// top. Google Analytics adds a rough location and analytics uses (GOOGLE_ANALYTICS_PARAGRAPH);
// push notifications add the notification address, the bag and wishlist for reminders and
// the phone's time zone, which covers far more than Google's 3 square kilometres
// (PUSH_PARAGRAPH); shopper accounts add the account's details and the customer's ID, a
// "User ID" in Google's words: "an account ID, account number, or account name".
export function dataSafetyItems(options: PrivacyOptions = {}): DataSafetyItem[] {
  const ga4 = options.googleAnalytics === true;
  const push = options.pushNotifications === true;
  const accounts = options.accounts === true;
  const account = (item: DataSafetyItem, what: string) =>
    accounts ? withAccount(item, what) : item;
  const location = [
    ...(ga4
      ? [
          "Worked out by Google Analytics from the phone's IP address, after the shopper allows usage data.",
        ]
      : []),
    ...(push
      ? [
          "The phone's time zone, after the shopper allows notifications, so reminders don't arrive at night.",
        ]
      : []),
  ];
  const ids = ga4
    ? "The random ID the app creates, and Google Analytics' ID for the app on the phone, after the shopper allows usage data. Not the advertising ID."
    : "The random ID the app creates when the shopper allows usage data.";
  const usage = ga4
    ? `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times, sent to Appsy and Google Analytics.`
    : `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times.`;
  const purchases = atCheckout(
    "Financial info",
    "Purchase history",
    [
      ga4
        ? "The bag and the order placed at checkout; orders also go to Google Analytics, after the shopper allows usage data."
        : "The bag and the order placed at checkout.",
      ...(accounts ? ["Signed-in shoppers see their past orders in the Account tab."] : []),
    ].join(" "),
  );
  return [
    ...(location.length > 0
      ? [
          {
            category: "Location",
            type: "Approximate location",
            what: location.join(" "),
            purposes: [
              ...(ga4 ? ["Analytics" as const] : []),
              ...(push ? ["App functionality" as const] : []),
            ],
            optional: true,
          },
        ]
      : []),
    account(
      atCheckout("Personal info", "Name", "Entered at checkout."),
      "And in the shopper's account, which they can see and change after signing in.",
    ),
    account(
      atCheckout("Personal info", "Email address", "Entered at checkout."),
      "And the email address the shopper signs in with.",
    ),
    ...(accounts
      ? [
          {
            category: "Personal info",
            type: "User IDs",
            what: `The shopper's customer account at the store, after they sign in. The sign-in stays on the phone; Appsy keeps the customer's number with a request to delete the account, for ${ACCOUNT_DELETION_KEEP_DAYS} days at most.`,
            purposes: ["App functionality", "Account management"],
            optional: true,
          } satisfies DataSafetyItem,
        ]
      : []),
    account(
      atCheckout("Personal info", "Address", "The delivery address entered at checkout."),
      "And addresses saved in the shopper's account, which they can change after signing in.",
    ),
    account(
      atCheckout(
        "Personal info",
        "Phone number",
        "Entered at checkout, if the checkout asks for it.",
      ),
      "And the phone number in the shopper's account.",
    ),
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
        ? `${usage} And, after the shopper allows notifications, what's in their bag (by its ID at the store) and on their wishlist, with when each changed, for reminders; and a count of taps on each notification, not linked to the phone.`
        : usage,
      purposes: push ? ["Analytics", "Advertising or marketing"] : ["Analytics"],
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

// Apple's names for the purposes Appsy's App Store answers use (App Privacy Details,
// https://developer.apple.com/app-store/app-privacy-details/, checked 2026-11-02). Apple puts
// "sending marketing communications directly to your users" under Developer's Advertising
// or Marketing.
export type AppPrivacyPurpose =
  | "App Functionality"
  | "Analytics"
  | "Developer's Advertising or Marketing";

// One data type to choose under App Privacy in App Store Connect, with Apple's category and
// type names. None is used for tracking as Apple defines it: no data is linked with other
// companies' data for advertising, or shared with a data broker. `linked`: whether it's
// linked to the shopper's identity, which Apple says collected data usually is unless it's
// de-identified before it's collected.
export type AppPrivacyItem = {
  category: string;
  type: string;
  what: string;
  purposes: AppPrivacyPurpose[];
  linked: boolean;
};

const enteredAtCheckout = (category: string, type: string, what: string): AppPrivacyItem => ({
  category,
  type,
  what,
  purposes: ["App Functionality"],
  linked: true,
});

// In the order of Apple's App Privacy Details page. Like the Data safety answers, they
// include what shoppers enter in Shopify's checkout, which opens in the app: Apple counts data
// collected through web pages in an app. Google Analytics adds a
// coarse location and Firebase's diagnostic data, which Firebase's own Apple privacy file
// declares as not linked (FirebaseInstallations); push notifications add the phone's address
// from Apple's push service, the country and time zone it's kept with, and the bag and
// wishlist for reminders (purchase tendencies, in Apple's words). Shopper accounts add the
// account's details and the customer's ID, a "User ID" in Apple's words ("account ID ...
// customer number, or other user- or account-level ID").
export function appPrivacyItems(options: PrivacyOptions = {}): AppPrivacyItem[] {
  const ga4 = options.googleAnalytics === true;
  const push = options.pushNotifications === true;
  const accounts = options.accounts === true;
  const inAccount = (what: string, account: string) =>
    accounts ? `${what} ${account}` : what;
  const ids = ga4
    ? "The random ID the app creates, and Google Analytics' ID for the app on the phone, after the shopper allows usage data. Not the advertising ID or Apple's vendor ID."
    : "The random ID the app creates when the shopper allows usage data.";
  const usage = ga4
    ? `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times, sent to Appsy and Google Analytics.`
    : `Usage data, after the shopper allows it: ${MERCHANT_EVENTS}, with their times.`;
  const location: string[] = [
    ...(ga4
      ? [
          "Worked out by Google Analytics from the phone's IP address, after the shopper allows usage data.",
        ]
      : []),
    ...(push
      ? [
          "The country the shopper chose in the app and the phone's time zone, kept with their notification address after they allow notifications, to send offers to some countries and no reminders at night.",
        ]
      : []),
  ];
  const purchases = [
    ga4
      ? "The bag and the order placed at checkout; orders also go to Google Analytics, after the shopper allows usage data."
      : "The bag and the order placed at checkout.",
    ...(push
      ? [
          "And, after the shopper allows notifications, what's in their bag (by its ID at the store) and on their wishlist, with when each changed, for reminders.",
        ]
      : []),
    ...(accounts ? ["Signed-in shoppers see their past orders in the Account tab."] : []),
  ];
  return [
    enteredAtCheckout(
      "Contact Info",
      "Name",
      inAccount(
        "Entered at checkout.",
        "And in the shopper's account, which they can see and change after signing in.",
      ),
    ),
    enteredAtCheckout(
      "Contact Info",
      "Email Address",
      inAccount("Entered at checkout.", "And the email address the shopper signs in with."),
    ),
    enteredAtCheckout(
      "Contact Info",
      "Phone Number",
      inAccount(
        "Entered at checkout, if the checkout asks for it.",
        "And the phone number in the shopper's account.",
      ),
    ),
    enteredAtCheckout(
      "Contact Info",
      "Physical Address",
      inAccount(
        "The delivery address entered at checkout.",
        "And addresses saved in the shopper's account, which they can change after signing in.",
      ),
    ),
    enteredAtCheckout(
      "Financial Info",
      "Payment Info",
      "Card or other payment details entered at checkout.",
    ),
    ...(location.length > 0
      ? [
          {
            category: "Location",
            type: "Coarse Location",
            what: location.join(" "),
            purposes: [
              ...(push ? ["App Functionality" as const] : []),
              ...(ga4 ? ["Analytics" as const] : []),
              ...(push ? ["Developer's Advertising or Marketing" as const] : []),
            ],
            linked: true,
          },
        ]
      : []),
    {
      category: "Search History",
      type: "Search History",
      what: "The words shoppers search for, sent to Shopify to find products.",
      purposes: ["App Functionality"],
      linked: true,
    },
    ...(accounts
      ? [
          {
            category: "Identifiers",
            type: "User ID",
            what: `The shopper's customer account at the store, after they sign in. The sign-in stays on the phone; Appsy keeps the customer's number with a request to delete the account, for ${ACCOUNT_DELETION_KEEP_DAYS} days at most.`,
            purposes: ["App Functionality"],
            linked: true,
          } satisfies AppPrivacyItem,
        ]
      : []),
    {
      category: "Identifiers",
      type: "Device ID",
      what: push
        ? `${ids} And, after the shopper allows notifications, the phone's notification address from Apple's push service and another random ID, to send the store's offers and news.`
        : ids,
      purposes: push
        ? ["App Functionality", "Analytics", "Developer's Advertising or Marketing"]
        : ["Analytics"],
      linked: true,
    },
    {
      category: "Purchases",
      type: "Purchase History",
      what: purchases.join(" "),
      purposes: [
        "App Functionality",
        ...(ga4 ? ["Analytics" as const] : []),
        ...(push ? ["Developer's Advertising or Marketing" as const] : []),
      ],
      linked: true,
    },
    {
      category: "Usage Data",
      type: "Product Interaction",
      what: push
        ? `${usage} And, after the shopper allows notifications, a count of taps on each notification, not linked to the phone.`
        : usage,
      purposes: ["Analytics"],
      linked: true,
    },
    ...(ga4
      ? [
          {
            category: "Diagnostics",
            type: "Other Diagnostic Data",
            what: "Firebase, which Google Analytics uses, tells Google the phone's model and system version, and the app's ID and platform, never linked to the shopper or the phone.",
            purposes: ["Analytics" as const],
            linked: false,
          },
        ]
      : []),
  ];
}
