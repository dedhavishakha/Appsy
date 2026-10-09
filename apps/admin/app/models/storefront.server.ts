import { apiVersion } from "../shopify.server";

// Calls the Storefront API the way merchants' phone apps do: Appsy's public token,
// straight to Shopify.
export async function storefrontQuery<T>(
  shopDomain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://${shopDomain}/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as { data?: T; errors?: unknown };
  if (!response.ok || json.errors || !json.data) {
    throw new Error(
      `Storefront API ${response.status}: ${JSON.stringify(json.errors ?? json)}`,
    );
  }
  return json.data;
}
