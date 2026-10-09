import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Appsy's rows stay until Shopify's shop/redact webhook, 48 hours after an uninstall,
  // so a quick reinstall keeps the merchant's work. Safe to run again if the webhook repeats.
  await db.shop.updateMany({
    where: { shopDomain: shop, uninstalledAt: null },
    data: { uninstalledAt: new Date(), channelState: "disconnected" },
  });

  return new Response();
};
