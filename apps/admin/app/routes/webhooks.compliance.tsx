import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { customerErased } from "../models/account-deletion.server";
import { deletePublicFiles } from "../models/storage.server";
import { deleteStoreKeys } from "../models/vault.server";

// Shopify's mandatory privacy webhooks (docs/05-security-and-compliance.md, section 4).
// authenticate.webhook answers requests with an invalid HMAC with 401, as Shopify requires.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    // Appsy keeps no customer's data apart from a pending account deletion request, which
    // only holds the customer's ID, and goes once the customer is erased (below).
    case "CUSTOMERS_DATA_REQUEST":
      break;
    // The customer is erased: a phone that asked to delete its shopper's account hears so,
    // and Appsy forgets the request (models/account-deletion.server.ts).
    case "CUSTOMERS_REDACT":
      await customerErased(
        shop,
        (payload as { customer?: { id?: unknown } } | null)?.customer?.id,
      );
      break;
    // Sent 48 hours after an uninstall. Deleting the Shop row also deletes its app,
    // design versions, analytics and asset records; its published files (designs, icon and
    // splash pictures) and its store keys in the vault go too. If any of it fails, Shopify
    // sends the webhook again.
    case "SHOP_REDACT": {
      const record = await db.shop.findUnique({
        where: { shopDomain: shop },
        select: { appProject: { select: { id: true } } },
      });
      if (record?.appProject) {
        await deleteStoreKeys(record.appProject.id);
        await deletePublicFiles(record.appProject.id);
      }
      await db.$transaction([
        db.shop.deleteMany({ where: { shopDomain: shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;
    }
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
