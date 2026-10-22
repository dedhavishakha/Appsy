import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { PublicPage } from "../../components/public-page";

import styles from "./styles.module.css";

// Appsy's front page, for anyone who opens appsy.scopegen.in outside Shopify. Merchants install
// Appsy from the Shopify App Store and open it in their Shopify admin, so nothing here asks
// for a store's address (App Store requirement 2.3.1).

export const meta: MetaFunction = () => [
  { title: "Appsy by Scopegen" },
  {
    name: "description",
    content: "Branded iPhone and Android shopping apps for Shopify stores.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify opens the app's address with the store in the query: that's the app itself.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {
  return (
    <PublicPage>
      <section className={styles.hero}>
        <h1 className={styles.heading}>Your Shopify store as a mobile app</h1>
        <p className={styles.text}>
          Appsy builds branded iPhone and Android shopping apps from your
          Shopify store. You design them in your Shopify admin, with no code.
        </p>
        <p className={styles.install}>
          Appsy is installed from the Shopify App Store and opened from your
          Shopify admin.
        </p>
      </section>
      <ul className={styles.list}>
        <li>
          <strong>Design without code.</strong> Arrange sections, colours and
          fonts in an editor, and see each change on a phone as you make it.
        </li>
        <li>
          <strong>Your products, Shopify checkout.</strong> Products,
          collections, search and the bag come straight from your store, and
          shoppers pay in Shopify&apos;s checkout.
        </li>
        <li>
          <strong>Your own app.</strong> It&apos;s published on the App Store
          and Google Play under your own developer accounts, with your name and
          brand.
        </li>
      </ul>
    </PublicPage>
  );
}
