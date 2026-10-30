import * as WebBrowser from "expo-web-browser";
import type { Cart } from "./queries";

// Opens Shopify's checkout for the bag, resolving when the shopper leaves it. Phone builds
// use Checkout Kit (checkout.native.ts), which also says when an order is placed; the
// editor's preview (web) opens Shopify's checkout in the browser and can't tell.

// An order placed in checkout, for Google Analytics' purchase event.
export type PlacedOrder = { id: string; tax?: number; shipping?: number };

export async function openCheckout(
  cart: Cart,
  _onOrder: (order: PlacedOrder) => void,
): Promise<void> {
  await WebBrowser.openBrowserAsync(cart.checkoutUrl);
}
