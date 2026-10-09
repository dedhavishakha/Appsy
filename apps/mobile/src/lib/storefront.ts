import { useQuery } from "@tanstack/react-query";
import type { PublishedSettings } from "@appsy/app-config";
import { useSettings } from "./app-settings";

// Seeaash's Storefront client, pointed at the store named in the settings file.
export async function storefront<T>(
  shop: PublishedSettings["shop"],
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://${shop.domain}/api/${shop.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Storefront-Access-Token": shop.storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "The store is busy right now. Please try again in a moment."
        : `Couldn't reach the store (${response.status}).`,
    );
  }
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("\n"));
  if (!json.data) throw new Error("The store returned an empty response.");
  return json.data;
}

// Store data for a screen or section, priced for the shopper's country (Shopify Markets).
// Until shoppers can pick a country, that's the design's default country.
export function useStorefront<T>(
  key: readonly unknown[],
  query: string,
  variables: Record<string, unknown>,
  enabled = true,
) {
  const settings = useSettings();
  const country = settings.markets.defaultCountry;
  return useQuery({
    queryKey: ["storefront", country, ...key],
    queryFn: () => storefront<T>(settings.shop, query, { ...variables, country }),
    enabled,
  });
}
