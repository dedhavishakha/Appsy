import type { MetaFunction } from "react-router";
import { LegalDocument } from "../components/public-page";

// Appsy's own privacy policy (separate from each store's policy, which its app also links
// to). A DRAFT written 2026-10-21 from the data Appsy handles today (docs/05, sections 7 and
// 9); Scopegen fills in the [bracketed] details and has a lawyer review it before launch.
// Keep it in step with the code: a new kind of data means a change here first.

export const meta: MetaFunction = () => [{ title: "Appsy privacy policy" }];

export default function Privacy() {
  return (
    <LegalDocument title="Appsy privacy policy" updated="21 October 2026">
      <h2>1. Who we are</h2>
      <p>
        Appsy is made by [Scopegen&apos;s legal name], of [registered address]
        (&quot;Scopegen&quot;, &quot;we&quot;). This policy explains what Appsy
        collects from merchants who install it and from shoppers who use apps
        built with it, and how we use that data. Each store&apos;s own privacy
        policy also applies to its app.
      </p>

      <h2>2. Data from merchants</h2>
      <p>When you install and use Appsy, we receive from Shopify and keep:</p>
      <ul>
        <li>
          your store&apos;s Shopify ID and Shopify address, its name (used as
          your app&apos;s name until you change it) and its country;
        </li>
        <li>
          the credentials Shopify issues to Appsy, which let it read your
          products, collections, files and menus and manage its sales channel,
          and the Storefront token your app uses to show your products;
        </li>
        <li>
          your app&apos;s designs and settings, including links to the pictures
          you choose from your Shopify Files, and the Shopify staff ID of
          whoever saved each design version.
        </li>
      </ul>
      <p>
        Your store&apos;s products, customers and orders stay in Shopify. If
        Shopify gives Appsy access to the orders placed through your app, we
        read them from Shopify when you open Analytics and don&apos;t keep
        copies.
      </p>

      <h2>3. Data from shoppers in your app</h2>
      <ul>
        <li>
          The app sends no usage data to Appsy unless the shopper allows it.
        </li>
        <li>
          If the shopper allows it, the app sends a random install ID it
          creates, a session ID, and events with their times: app opens, product
          and collection views, searches (not the words searched), adding to the
          bag, starting checkout and wishlist saves. It sends no names, emails,
          addresses or typed text.
        </li>
        <li>
          The shopper can change this choice at any time under Privacy choices
          in the app&apos;s menu. Turning it off deletes the install ID and any
          unsent events from the phone.
        </li>
        <li>
          The wishlist and the shopper&apos;s chosen country and currency stay
          on their phone.
        </li>
        <li>
          The bag and checkout are run by Shopify, under{" "}
          <a href="https://www.shopify.com/legal/privacy">
            Shopify&apos;s privacy policy
          </a>
          . The shopper&apos;s usage-data choice is passed on to Shopify&apos;s
          checkout.
        </li>
        <li>
          If the store turns on currency conversion, the phone downloads
          exchange rates directly from ExchangeRate-API, which sees the
          phone&apos;s IP address, as with any web request.
        </li>
      </ul>

      <h2>4. How we use data</h2>
      <p>
        Only to run Appsy: to show the editor, publish designs, build apps, show
        analytics to the store, keep Appsy secure and answer support requests.
        We don&apos;t sell data or use it for advertising, and we share it only
        with the service providers below or when the law requires it.
      </p>

      <h2>5. Service providers</h2>
      <ul>
        <li>Shopify: the store platform and checkout.</li>
        <li>
          Amazon Web Services: hosts Appsy&apos;s servers and database in its
          Mumbai region, India.
        </li>
        <li>Cloudflare: network services in front of appsy.scopegen.in.</li>
        <li>Expo: builds the mobile apps.</li>
        <li>
          ExchangeRate-API: exchange rates, downloaded by phones only when
          currency conversion is on.
        </li>
      </ul>
      <p>
        We use providers that protect data at least as well as this policy
        requires.
      </p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>Usage events: up to 13 months, then deleted.</li>
        <li>
          Store data: erased when Shopify asks us to, 48 hours after you
          uninstall Appsy.
        </li>
        <li>
          Server logs (such as IP address, time and page requested): [retention
          period], for security.
        </li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Connections to Appsy are encrypted (HTTPS), the database password is
        kept in a secrets service rather than in our code, and only Scopegen
        staff who need it can reach the data.
      </p>

      <h2>8. Your choices and requests</h2>
      <ul>
        <li>
          Merchants: contact us to see, correct or delete your store&apos;s
          data, or uninstall Appsy at any time.
        </li>
        <li>
          Shoppers: contact the store. Appsy answers the customer data and
          erasure requests Shopify sends on the store&apos;s behalf. Usage
          events aren&apos;t linked to a shopper&apos;s name or email.
        </li>
      </ul>

      <h2>9. Children</h2>
      <p>Appsy is a tool for businesses and isn&apos;t directed at children.</p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy. This page shows the date of the latest
        version, and we&apos;ll tell merchants in Appsy before significant
        changes take effect.
      </p>

      <h2>11. Contact</h2>
      <p>Privacy questions: [contact email], [registered address].</p>
    </LegalDocument>
  );
}
