import type { ShopSetup } from "./shop.server";
import { storefrontQuery } from "./storefront.server";

// The store's privacy policy, read the way phones read it: the link the app opens from
// Privacy choices, which merchants also give Google and Apple (the Publishing page's
// privacy section, components/privacy-forms.tsx).

const PRIVACY_POLICY_QUERY = `#graphql
  query AppsyPrivacyPolicy {
    shop {
      privacyPolicy {
        url
      }
    }
  }`;

export type PrivacyPolicy =
  | { status: "found"; url: string }
  | { status: "missing" }
  | { status: "unavailable" };

export async function loadPrivacyPolicy(
  shop: ShopSetup,
): Promise<PrivacyPolicy> {
  if (!shop.storefrontToken) return { status: "unavailable" };
  try {
    const data = await storefrontQuery<{
      shop: { privacyPolicy: { url: string } | null };
    }>(shop.shopDomain, shop.storefrontToken, PRIVACY_POLICY_QUERY);
    const url = data.shop.privacyPolicy?.url;
    return url ? { status: "found", url } : { status: "missing" };
  } catch (error) {
    console.error(`Privacy policy for ${shop.shopDomain}:`, error);
    return { status: "unavailable" };
  }
}
