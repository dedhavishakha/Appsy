import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { planPageUrl } from "../models/plans.server";

// "Change plan" and "Upgrade" links: Shopify's plan page, where merchants move up or down
// themselves (App Store requirement 1.2.3), outside Appsy's frame.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  return redirect(await planPageUrl(admin, session.shop), { target: "_top" });
};
