import { createContext, useContext, useEffect, useRef } from "react";
import type { AnalyticsEventName, AnalyticsProps } from "@appsy/app-config";

// The shopper's answer about usage data: allowed, declined, or not asked yet.
export type Consent = "granted" | "denied" | "unknown";

export type Analytics = {
  consent: Consent;
  setConsent: (allowed: boolean) => void;
  // Records an event; does nothing unless the shopper allowed usage data.
  track: <Name extends AnalyticsEventName>(name: Name, props: AnalyticsProps<Name>) => void;
};

// Shared by components/analytics-provider.tsx. Outside it (the start screen before the
// design loads), nothing is recorded.
export const AnalyticsContext = createContext<Analytics>({
  consent: "unknown",
  setConsent: () => {},
  track: () => {},
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

// The same answer for Shopify's checkout (Storefront API visitorConsent): Shopify's mobile
// guidance is to collect consent in the app and pass it with the cart. Not asked yet means
// not provided.
export function visitorConsent(consent: Consent): { analytics?: boolean } {
  return consent === "unknown" ? {} : { analytics: consent === "granted" };
}
