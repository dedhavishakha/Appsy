import { Prisma, type AppProject, type Shop } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { createDefaultDesign, SCHEMA_VERSION } from "@appsy/app-config";
import db from "../db.server";

// Google Play allows app names of up to 30 characters.
const MAX_APP_NAME_LENGTH = 30;

const SHOP_BOOTSTRAP_QUERY = `#graphql
  query AppsyShopBootstrap {
    shop {
      id
      name
      myshopifyDomain
      shopAddress {
        countryCodeV2
      }
    }
  }`;

type ShopBootstrap = {
  shop: {
    id: string;
    name: string;
    myshopifyDomain: string;
    shopAddress: { countryCodeV2: string | null };
  };
};

export type ShopSetup = Shop & { appProject: AppProject };

// Makes sure the store has its Appsy rows: Shop, AppProject and design version 1. Runs on
// every admin page load; once the rows exist, it's a single lookup.
export async function ensureShopSetup(
  admin: AdminApiContext,
  shopDomain: string,
): Promise<ShopSetup> {
  const existing = await db.shop.findUnique({
    where: { shopDomain },
    include: { appProject: true },
  });
  if (existing?.appProject && existing.uninstalledAt === null) {
    return { ...existing, appProject: existing.appProject };
  }

  const response = await admin.graphql(SHOP_BOOTSTRAP_QUERY);
  const { data } = (await response.json()) as { data: ShopBootstrap };

  try {
    return await db.$transaction(async (tx) => {
      const shop = await tx.shop.upsert({
        where: { shopDomain },
        create: { shopDomain, shopGid: data.shop.id },
        // Reinstalled before Shopify's shop/redact arrived: the merchant's work is still here.
        // The saved Storefront token is cleared so it's looked up again: Shopify's docs don't
        // say whether an uninstall revokes it.
        update: existing?.uninstalledAt
          ? {
              uninstalledAt: null,
              installedAt: new Date(),
              storefrontTokenGid: null,
              storefrontToken: null,
            }
          : {},
        include: { appProject: true },
      });
      if (shop.appProject) return { ...shop, appProject: shop.appProject };

      const design = createDefaultDesign({
        defaultCountry: data.shop.shopAddress.countryCodeV2 ?? "US",
        // Choosing the ☰ menu comes with the navigation editor (Phase 3).
        drawerMenu: null,
      });
      const appProject = await tx.appProject.create({
        data: {
          shopId: shop.id,
          appName: data.shop.name.slice(0, MAX_APP_NAME_LENGTH),
          configVersions: {
            create: {
              number: 1,
              schemaVersion: SCHEMA_VERSION,
              // app-config's schema only produces JSON values.
              json: design as Prisma.InputJsonValue,
            },
          },
        },
      });
      return { ...shop, appProject };
    });
  } catch (error) {
    // Two first page loads at the same moment: the other one created the rows.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const shop = await db.shop.findUniqueOrThrow({
        where: { shopDomain },
        include: { appProject: true },
      });
      if (shop.appProject) return { ...shop, appProject: shop.appProject };
    }
    throw error;
  }
}
