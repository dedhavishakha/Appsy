import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { unauthenticated } from "../shopify.server";
import { ERASURE_SCOPE, type CustomerAccountsVersion } from "./accounts";
import { storefrontQuery } from "./storefront.server";

// Shopper accounts on Appsy's Functionality page (app-config accounts.ts): what Appsy checks
// before a store switches them on.

// Shopify: "Shopify's customer accounts is required to use the Customer Account API"
// (https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/getting-started).
// The store picks them in Settings › Customer accounts; CLASSIC is the legacy kind.
const CUSTOMER_ACCOUNTS_QUERY = `#graphql
  query AppsyCustomerAccounts {
    shop {
      customerAccountsV2 {
        customerAccountsVersion
      }
    }
  }`;

type CustomerAccountsData = {
  data?: {
    shop: { customerAccountsV2: { customerAccountsVersion: string } | null };
  };
  errors?: unknown;
};

// Which customer accounts the store uses, or null when Shopify didn't say.
export async function customerAccountsVersion(
  admin: AdminApiContext,
): Promise<CustomerAccountsVersion | null> {
  try {
    const response = await admin.graphql(CUSTOMER_ACCOUNTS_QUERY);
    const body = (await response.json()) as CustomerAccountsData;
    const version = body.data?.shop.customerAccountsV2?.customerAccountsVersion;
    if (version === "NEW_CUSTOMER_ACCOUNTS" || version === "CLASSIC")
      return version;
    console.error(
      "Customer accounts version:",
      JSON.stringify(body.errors ?? version),
    );
    return null;
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Customer accounts version:", error);
    return null;
  }
}

// The other sign-in services the store's Shopify sign-in page offers (Storefront API
// Shop.socialLoginProviders, read with Appsy's Storefront token as phones read the store),
// such as "Shop". Apple's App Review guideline 4.8 asks apps whose sign-in uses a
// third-party or social login service to offer an equivalent private one too. Null when
// Shopify didn't say.
const SOCIAL_LOGIN_QUERY = `#graphql
  query AppsySocialLogin {
    shop {
      socialLoginProviders {
        handle
      }
    }
  }`;

export async function socialLoginProviders(shop: {
  shopDomain: string;
  storefrontToken: string | null;
}): Promise<string[] | null> {
  if (!shop.storefrontToken) return null;
  try {
    const data = await storefrontQuery<{
      shop: { socialLoginProviders: { handle: string }[] };
    }>(shop.shopDomain, shop.storefrontToken, SOCIAL_LOGIN_QUERY);
    return data.shop.socialLoginProviders.map((provider) => provider.handle);
  } catch (error) {
    console.error("Social sign-in providers:", error);
    return null;
  }
}

// The store's name and the email address it gives customers: "The public-facing contact
// email address for the shop. Customers will use this email to communicate with the shop
// owner" (Admin API Shop.contactEmail). For the public account deletion page
// (routes/delete-account.$appId.tsx). Null when Shopify can't be asked.
const STORE_CONTACT_QUERY = `#graphql
  query AppsyShopContact {
    shop {
      name
      contactEmail
    }
  }`;

export async function storeContact(
  shopDomain: string,
): Promise<{ name: string; email: string | null } | null> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const response = await admin.graphql(STORE_CONTACT_QUERY);
    const body = (await response.json()) as {
      data?: { shop: { name: string; contactEmail: string | null } };
    };
    const shop = body.data?.shop;
    return shop ? { name: shop.name, email: shop.contactEmail || null } : null;
  } catch (error) {
    console.error(`Contact details of ${shopDomain}:`, error);
    return null;
  }
}

// Whether the store has granted Appsy the erasure scope (accounts.ts ERASURE_SCOPE).
export async function hasErasureAccess(scopes: {
  query: () => Promise<{ granted: string[] }>;
}): Promise<boolean> {
  return scopes
    .query()
    .then(({ granted }) => granted.includes(ERASURE_SCOPE))
    .catch(() => false);
}
