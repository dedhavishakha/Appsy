import { createContext, useContext, useEffect, useRef } from "react";
import {
  ga4ViewItem,
  ga4ViewItemList,
  type AnalyticsEventName,
  type AnalyticsProps,
  type Ga4Event,
  type Ga4ItemInput,
} from "@appsy/app-config";

// The shopper's answer about usage data: allowed, declined, or not asked yet.
export type Consent = "granted" | "denied" | "unknown";

export type Analytics = {
  consent: Consent;
  setConsent: (allowed: boolean) => void;
  // Records an event; does nothing unless the shopper allowed usage data.
  track: <Name extends AnalyticsEventName>(name: Name, props: AnalyticsProps<Name>) => void;
  // Sends a shopping event to the store's Google Analytics (app-config ga4.ts); does nothing
  // unless the shopper allowed usage data, the store switched Google Analytics on, and the
  // build has the store's Firebase file (lib/ga4.native.ts).
  trackGa4: (event: Ga4Event) => void;
};

// Shared by components/analytics-provider.tsx. Outside it (the start screen before the
// design loads), nothing is recorded.
export const AnalyticsContext = createContext<Analytics>({
  consent: "unknown",
  setConsent: () => {},
  track: () => {},
  trackGa4: () => {},
});

export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}

// Records a product or collection page view, once per item shown.
export function useViewEvent(
  event: "product_view" | "collection_view",
  id: string | undefined,
) {
  const { track } = useAnalytics();
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || seen.current === id) return;
    seen.current = id;
    if (event === "product_view") track("product_view", { productId: id });
    else track("collection_view", { collectionId: id });
  }, [event, id, track]);
}

// A product's details as Google Analytics takes them: its lowest price, or the chosen
// variant's when there is one.
export function ga4Product(
  product: { id: string; title: string; vendor?: string },
  price: { amount: string },
  variant?: string,
): Ga4ItemInput {
  return {
    productId: product.id,
    name: product.title,
    ...(product.vendor ? { brand: product.vendor } : {}),
    ...(variant ? { variant } : {}),
    price: Number(price.amount),
  };
}

// A bag line as Google Analytics takes it, at the price of one.
export function ga4Line(line: {
  quantity: number;
  cost: { amountPerQuantity: { amount: string } };
  merchandise: { title: string; product: { id: string; title: string; vendor: string } };
}): Ga4ItemInput {
  return {
    ...ga4Product(line.merchandise.product, line.cost.amountPerQuantity, line.merchandise.title),
    quantity: line.quantity,
  };
}

// Google Analytics' view_item, once per product shown.
export function useGa4ViewItem(
  product: { id: string; title: string; vendor?: string } | undefined,
  price: { amount: string; currencyCode: string } | undefined,
) {
  const { trackGa4 } = useAnalytics();
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!product || !price || seen.current === product.id) return;
    seen.current = product.id;
    trackGa4(ga4ViewItem(price.currencyCode, ga4Product(product, price)));
  }, [product, price, trackGa4]);
}

// Google Analytics' view_item_list for a collection, once per collection, with the products
// its first page shows.
type ListedProduct = {
  id: string;
  title: string;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
};

export function useGa4ViewItemList(
  collection: { id: string; title: string } | undefined,
  products: ListedProduct[],
) {
  const { trackGa4 } = useAnalytics();
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    const first = products[0];
    if (!collection || !first || seen.current === collection.id) return;
    seen.current = collection.id;
    trackGa4(
      ga4ViewItemList(
        { id: collection.id, name: collection.title },
        products.map((product) => ga4Product(product, product.priceRange.minVariantPrice)),
      ),
    );
  }, [collection, products, trackGa4]);
}

// The same answer for Shopify's checkout (Storefront API visitorConsent): Shopify's mobile
// guidance is to collect consent in the app and pass it with the cart. Not asked yet means
// not provided.
export function visitorConsent(consent: Consent): { analytics?: boolean } {
  return consent === "unknown" ? {} : { analytics: consent === "granted" };
}
