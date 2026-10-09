import type { ChannelState } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

// Appsy's channel specification: extensions/channel-config/specifications/appsy-mobile-app.toml.
// Online store parity is off there, so stores can connect wherever they sell.
export const SPEC_HANDLE = "appsy-mobile-app";

// The name orders placed in merchants' apps show in Shopify (decided 2026-10-08).
const ACCOUNT_NAME = "Mobile app";

const CHANNELS_QUERY = `#graphql
  query AppsyChannels {
    channels(first: 10) {
      nodes {
        id
        handle
        accountName
        specificationHandle
        productsCount {
          count
          precision
        }
      }
    }
  }`;

const CHANNEL_CREATE_MUTATION = `#graphql
  mutation AppsyChannelCreate($input: ChannelCreateInput!) {
    channelCreate(input: $input) {
      channel {
        id
        handle
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const CHANNEL_DELETE_MUTATION = `#graphql
  mutation AppsyChannelDelete($id: ID!) {
    channelDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }`;

export type AppsyChannel = {
  id: string;
  handle: string;
  accountName: string | null;
  specificationHandle: string | null;
  productsCount: { count: number; precision: "EXACT" | "AT_LEAST" } | null;
};

type UserError = { message: string };

// Reads Appsy's channel connection from Shopify, which is the source of truth, and keeps
// Shop.channelState in step with it.
export async function loadChannel(
  admin: AdminApiContext,
  shop: { id: string; channelState: ChannelState },
): Promise<AppsyChannel | null> {
  const response = await admin.graphql(CHANNELS_QUERY);
  const { data } = (await response.json()) as {
    data: { channels: { nodes: AppsyChannel[] } };
  };
  const channel =
    data.channels.nodes.find((node) => node.specificationHandle === SPEC_HANDLE) ?? null;

  const state: ChannelState = channel
    ? "connected"
    : shop.channelState === "connected"
      ? "disconnected"
      : shop.channelState;
  if (state !== shop.channelState) {
    await db.shop.update({ where: { id: shop.id }, data: { channelState: state } });
  }
  return channel;
}

// Connects the store to Appsy's channel. The account is the merchant's Appsy app, so a
// later second app per store can get its own connection.
export async function connectChannel(
  admin: AdminApiContext,
  shopId: string,
  appProjectId: string,
): Promise<string[]> {
  const response = await admin.graphql(CHANNEL_CREATE_MUTATION, {
    variables: {
      input: {
        specificationHandle: SPEC_HANDLE,
        accountId: appProjectId,
        accountName: ACCOUNT_NAME,
      },
    },
  });
  const { data } = (await response.json()) as {
    data: { channelCreate: { userErrors: UserError[] } };
  };
  const errors = data.channelCreate.userErrors.map((error) => error.message);
  if (errors.length === 0) {
    await db.shop.update({ where: { id: shopId }, data: { channelState: "connected" } });
  }
  return errors;
}

// Disconnects without contacting support (App Store requirement 5.7.12). Shopify removes
// the channel's product feeds and keeps orders already placed through the app.
export async function disconnectChannel(
  admin: AdminApiContext,
  shopId: string,
  channelId: string,
): Promise<string[]> {
  const response = await admin.graphql(CHANNEL_DELETE_MUTATION, {
    variables: { id: channelId },
  });
  const { data } = (await response.json()) as {
    data: { channelDelete: { userErrors: UserError[] } };
  };
  const errors = data.channelDelete.userErrors.map((error) => error.message);
  if (errors.length === 0) {
    await db.shop.update({ where: { id: shopId }, data: { channelState: "disconnected" } });
  }
  return errors;
}
