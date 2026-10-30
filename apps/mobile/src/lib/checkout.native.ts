import * as WebBrowser from "expo-web-browser";
import type { Cart } from "./queries";
import type { PlacedOrder } from "./checkout";

export type { PlacedOrder };

// Shopify's checkout inside the app with Checkout Kit
// (https://shopify.dev/docs/storefronts/mobile/checkout-sheet-kit), which says when an order
// is placed. Its module throws when imported without its native code, so it loads only on
// first use, and Expo Go, which can't have it, opens checkout in the browser instead.
// It uses the checkout's own branding from Shopify (web_default), and doesn't ask for the
// phone's location: the app declares no location access.

type Subscription = { remove: () => void } | undefined;
type CompletedEvent = {
  orderDetails: {
    id: string;
    cart?: { price?: { taxes?: { amount?: number }; shipping?: { amount?: number } } };
  };
};
type Sheet = {
  present: (checkoutUrl: string) => void;
  addEventListener: (name: string, callback: (event: never) => void) => Subscription;
};
type CheckoutKit = {
  ShopifyCheckoutSheet: new (configuration?: object, features?: object) => Sheet;
  ColorScheme: { web: string };
};

let sheet: Sheet | null | undefined;

function checkoutSheet(): Sheet | null {
  if (sheet === undefined) {
    try {
      const kit = require("@shopify/checkout-sheet-kit") as CheckoutKit;
      sheet = new kit.ShopifyCheckoutSheet(
        { colorScheme: kit.ColorScheme.web },
        { handleGeolocationRequests: false },
      );
    } catch {
      sheet = null;
    }
  }
  return sheet;
}

export function openCheckout(cart: Cart, onOrder: (order: PlacedOrder) => void): Promise<void> {
  const kit = checkoutSheet();
  if (!kit) return WebBrowser.openBrowserAsync(cart.checkoutUrl).then(() => undefined);
  return new Promise((resolve) => {
    const subscriptions: Subscription[] = [];
    const finish = () => {
      for (const subscription of subscriptions) subscription?.remove();
      resolve();
    };
    subscriptions.push(
      kit.addEventListener("completed", (event: CompletedEvent) => {
        const price = event.orderDetails.cart?.price;
        onOrder({
          id: event.orderDetails.id,
          tax: price?.taxes?.amount,
          shipping: price?.shipping?.amount,
        });
      }),
      // "close" comes whether or not an order was placed; "completed" comes first if it was.
      kit.addEventListener("close", finish),
      kit.addEventListener("error", finish),
    );
    kit.present(cart.checkoutUrl);
  });
}
