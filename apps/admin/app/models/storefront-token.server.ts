import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import type { ShopSetup } from "./shop.server";

// One token per store, shared by all of the store's phone apps. Shopify allows an app
// 100 active Storefront tokens per shop, so Appsy finds and reuses its own token.
const TOKEN_TITLE = "Appsy mobile apps";

const TOKENS_QUERY = `#graphql
  query AppsyStorefrontTokens {
    shop {
      storefrontAccessTokens(first: 100) {
        nodes {
          id
          title
          accessToken
        }
      }
    }
  }`;

const TOKEN_CREATE_MUTATION = `#graphql
  mutation AppsyStorefrontTokenCreate($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken {
        id
        title
        accessToken
      }
      userErrors {
        field
        message
      }
    }
  }`;

type StorefrontToken = { id: string; title: string; accessToken: string };

// Makes sure the store has Appsy's Storefront token, with its id and value saved. The token
// is public by Shopify's design (phone apps get it in the published settings file) and
// carries the app's unauthenticated_* scopes as they were when it was created.
export async function ensureStorefrontToken(
  admin: AdminApiContext,
  shop: ShopSetup,
): Promise<ShopSetup> {
  if (shop.storefrontTokenGid && shop.storefrontToken) return shop;

  const token = (await findToken(admin)) ?? (await createToken(admin));
  await db.shop.update({
    where: { id: shop.id },
    data: { storefrontTokenGid: token.id, storefrontToken: token.accessToken },
  });
  return { ...shop, storefrontTokenGid: token.id, storefrontToken: token.accessToken };
}

async function findToken(admin: AdminApiContext): Promise<StorefrontToken | null> {
  const response = await admin.graphql(TOKENS_QUERY);
  const { data } = (await response.json()) as {
    data: { shop: { storefrontAccessTokens: { nodes: StorefrontToken[] } } };
  };
  return (
    data.shop.storefrontAccessTokens.nodes.find((token) => token.title === TOKEN_TITLE) ??
    null
  );
}

async function createToken(admin: AdminApiContext): Promise<StorefrontToken> {
  const response = await admin.graphql(TOKEN_CREATE_MUTATION, {
    variables: { input: { title: TOKEN_TITLE } },
  });
  const { data } = (await response.json()) as {
    data: {
      storefrontAccessTokenCreate: {
        storefrontAccessToken: StorefrontToken | null;
        userErrors: { message: string }[];
      };
    };
  };
  const { storefrontAccessToken, userErrors } = data.storefrontAccessTokenCreate;
  if (!storefrontAccessToken) {
    throw new Error(
      `Shopify didn't create the Storefront token: ${userErrors.map((error) => error.message).join("; ")}`,
    );
  }
  return storefrontAccessToken;
}
