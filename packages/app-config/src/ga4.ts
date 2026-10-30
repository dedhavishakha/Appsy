import { z } from "zod";

// Google Analytics 4 in merchants' apps (doc 03, section J2). Each merchant connects their
// own Firebase project, made from their GA4 property, by uploading its google-services.json
// to Appsy; their app's build includes it, and the app sends Google's recommended
// e-commerce events through Firebase, only after the shopper allows usage data.
export const GA4_FEATURE = "google-analytics";

// --- Events -------------------------------------------------------------------------------
// Google's recommended e-commerce events
// (https://developers.google.com/analytics/devguides/collection/ga4/reference/events). An
// event missing a required parameter counts as a custom event and drops out of the
// e-commerce reports. `value` is price × quantity, without shipping or tax. The app sends no
// `search` event: Google lists the search words as required, and the app's privacy text
// promises they're never in usage data.

export type Ga4EventName =
  | "view_item"
  | "view_item_list"
  | "add_to_cart"
  | "add_to_wishlist"
  | "begin_checkout"
  | "purchase";

// One product as the app knows it.
export type Ga4ItemInput = {
  // Shopify's product id (gid://shopify/Product/…).
  productId: string;
  name: string;
  // The variant's title, such as "M / Blue", when one is chosen.
  variant?: string;
  // The product's vendor.
  brand?: string;
  // Price of one, in the event's currency.
  price: number;
  quantity?: number;
};

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_brand?: string;
  price: number;
  quantity: number;
};

export type Ga4Params = Record<string, string | number | Ga4Item[]>;
export type Ga4Event = { name: Ga4EventName; params: Ga4Params };

// Google takes up to 200 items in one event.
const MAX_ITEMS = 200;

const money = (amount: number) => Math.round(amount * 100) / 100;

// Shopify's number for the product, which stays the same when it's renamed.
const shopifyNumber = (gid: string) => gid.split("/").pop() ?? gid;

export function ga4Item(input: Ga4ItemInput): Ga4Item {
  return {
    item_id: shopifyNumber(input.productId),
    item_name: input.name.slice(0, 100),
    ...(input.variant && input.variant !== "Default Title"
      ? { item_variant: input.variant.slice(0, 100) }
      : {}),
    ...(input.brand ? { item_brand: input.brand.slice(0, 100) } : {}),
    price: money(input.price),
    quantity: Math.max(1, Math.round(input.quantity ?? 1)),
  };
}

function withItems(currency: string, inputs: Ga4ItemInput[], extra: Ga4Params = {}): Ga4Params {
  const items = inputs.slice(0, MAX_ITEMS).map(ga4Item);
  const value = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  return { currency, value, items, ...extra };
}

export const ga4ViewItem = (currency: string, item: Ga4ItemInput): Ga4Event => ({
  name: "view_item",
  params: withItems(currency, [item]),
});

export const ga4ViewItemList = (
  list: { id: string; name: string },
  items: Ga4ItemInput[],
): Ga4Event => ({
  name: "view_item_list",
  params: {
    item_list_id: shopifyNumber(list.id),
    item_list_name: list.name.slice(0, 100),
    items: items.slice(0, MAX_ITEMS).map(ga4Item),
  },
});

export const ga4AddToCart = (currency: string, item: Ga4ItemInput): Ga4Event => ({
  name: "add_to_cart",
  params: withItems(currency, [item]),
});

export const ga4AddToWishlist = (currency: string, item: Ga4ItemInput): Ga4Event => ({
  name: "add_to_wishlist",
  params: withItems(currency, [item]),
});

export const ga4BeginCheckout = (
  currency: string,
  items: Ga4ItemInput[],
  coupon?: string,
): Ga4Event => ({
  name: "begin_checkout",
  params: withItems(currency, items, coupon ? { coupon } : {}),
});

// From Shopify's checkout (Checkout Kit). Google: `transaction_id` "helps you avoid
// getting duplicate events for a purchase", so it's Shopify's order id.
export function ga4Purchase(order: {
  orderId: string;
  currency: string;
  items: Ga4ItemInput[];
  coupon?: string;
  tax?: number;
  shipping?: number;
}): Ga4Event {
  return {
    name: "purchase",
    params: withItems(order.currency, order.items, {
      transaction_id: shopifyNumber(order.orderId),
      ...(order.coupon ? { coupon: order.coupon } : {}),
      ...(order.tax !== undefined ? { tax: money(order.tax) } : {}),
      ...(order.shipping !== undefined ? { shipping: money(order.shipping) } : {}),
    }),
  };
}

// --- The merchant's Firebase file ----------------------------------------------------------
// google-services.json lists the project and its Android apps in a `client` array; Google's
// build plugin uses the entry whose package name matches the app's, exactly (it's
// case-sensitive), and fails if none does
// (https://developers.google.com/android/guides/google-services-plugin). So Appsy checks
// every entry, not just the first.

const googleServicesSchema = z.object({
  project_info: z.object({
    project_id: z.string().min(1),
    project_number: z.union([z.string(), z.number()]).transform(String),
  }),
  client: z.array(
    z.object({
      client_info: z.object({
        mobilesdk_app_id: z.string().min(1),
        android_client_info: z.object({ package_name: z.string().min(1) }),
      }),
    }),
  ),
});

export type FirebaseAndroidApp = {
  projectId: string;
  projectNumber: string;
  // Firebase's id for the Android app, like 1:123:android:abc.
  firebaseAppId: string;
  packageName: string;
};

export type GoogleServicesCheck =
  | { ok: true; app: FirebaseAndroidApp }
  | { ok: false; problem: "not-json" | "not-google-services" }
  | { ok: false; problem: "other-app"; packages: string[] };

export function checkGoogleServices(text: string, packageName: string): GoogleServicesCheck {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: "not-json" };
  }
  const file = googleServicesSchema.safeParse(data);
  if (!file.success) return { ok: false, problem: "not-google-services" };
  const match = file.data.client.find(
    (entry) => entry.client_info.android_client_info.package_name === packageName,
  );
  if (!match) {
    return {
      ok: false,
      problem: "other-app",
      packages: file.data.client.map((entry) => entry.client_info.android_client_info.package_name),
    };
  }
  return {
    ok: true,
    app: {
      projectId: file.data.project_info.project_id,
      projectNumber: file.data.project_info.project_number,
      firebaseAppId: match.client_info.mobilesdk_app_id,
      packageName,
    },
  };
}
