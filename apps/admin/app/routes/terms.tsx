import type { MetaFunction } from "react-router";
import { LegalDocument } from "../components/public-page";

// Appsy's terms and conditions: public, opened in a new window from Home and Settings (App
// Store requirement 5.7.7). A DRAFT written 2026-10-21 from what Appsy does today; Scopegen
// fills in the [bracketed] details and has a lawyer review it before Appsy's review.

export const meta: MetaFunction = () => [
  { title: "Appsy terms and conditions" },
];

export default function Terms() {
  return (
    <LegalDocument title="Appsy terms and conditions" updated="21 October 2026">
      <h2>1. About these terms</h2>
      <p>
        These terms are an agreement between you, the Shopify merchant who
        installs Appsy (&quot;you&quot;), and [Scopegen&apos;s legal name], of
        [registered address] (&quot;Scopegen&quot;, &quot;we&quot;). They apply
        when you install or use Appsy, Scopegen&apos;s app for building mobile
        shopping apps from a Shopify store. By installing Appsy or clicking
        Connect in Appsy, you agree to them. If you use Appsy for a business,
        you confirm that you may accept these terms for it.
      </p>

      <h2>2. What Appsy does</h2>
      <p>
        Appsy lets you design a mobile app for your store in your Shopify admin,
        publishes your design to the app, and helps you build the app and submit
        it to Apple&apos;s App Store and Google Play. Your app shows the
        products you make available to the Appsy sales channel, and shoppers pay
        in Shopify&apos;s checkout.
      </p>

      <h2>3. What you need</h2>
      <ul>
        <li>
          An active Shopify store. Shopify&apos;s own terms continue to apply.
        </li>
        <li>
          To publish your app, your own Apple Developer Program membership and
          Google Play developer account. You are the publisher of your app on
          those stores. Apple and Google decide whether to accept your app, and
          their fees and rules are between you and them.
        </li>
      </ul>

      <h2>4. Fees</h2>
      <ul>
        <li>
          Appsy doesn&apos;t take a commission on sales made through your app.
        </li>
        <li>
          Any Appsy subscription charges, including free trials, are shown to
          you before you accept them and are billed by Shopify on your Shopify
          invoice. You can change or cancel your plan in Shopify.
        </li>
        <li>Apple and Google charge their own fees for developer accounts.</li>
      </ul>

      <h2>5. Your store and your content</h2>
      <ul>
        <li>
          You&apos;re responsible for your store and for the products, prices,
          descriptions, images and other content shown in your app, and for your
          store&apos;s policies, including the privacy policy your app links to.
        </li>
        <li>
          You must have the rights to the names, logos and images you use, and
          your app must follow the law and Apple&apos;s, Google&apos;s and
          Shopify&apos;s rules.
        </li>
        <li>
          You allow Scopegen to use your content only to run Appsy for you: to
          show it in the editor, publish it to your app and build your app.
        </li>
      </ul>

      <h2>6. Data</h2>
      <ul>
        <li>
          How Appsy handles data is described in the{" "}
          <a href="/privacy">Appsy privacy policy</a>.
        </li>
        <li>
          Your store&apos;s products, customers and orders stay in Shopify.
          Appsy reads what it needs through Shopify&apos;s APIs.
        </li>
        <li>Your app collects usage data only after a shopper allows it.</li>
        <li>
          When you uninstall Appsy, Shopify asks us to erase your store&apos;s
          data 48 hours later, and we do.
        </li>
      </ul>

      <h2>7. Scopegen&apos;s rights</h2>
      <p>
        Appsy and its software belong to Scopegen. You may use Appsy while
        it&apos;s installed on your store, under these terms. You may not copy,
        resell or reverse-engineer Appsy, or try to reach other merchants&apos;
        data. Your app includes Appsy&apos;s software: you may publish it on the
        App Store and Google Play while you use Appsy. If you uninstall Appsy,
        your app stops receiving design updates and may stop working.
      </p>

      <h2>8. Other companies&apos; services</h2>
      <p>
        Appsy relies on Shopify, Apple, Google, Expo and Amazon Web Services.
        Their own terms apply to your use of them. We aren&apos;t responsible
        for their decisions, such as the outcome of an app review, or for
        outages on their side.
      </p>

      <h2>9. Availability and changes</h2>
      <p>
        We work to keep Appsy available, and we may change, add or remove
        features. We&apos;ll tell you in Appsy or by email before a change that
        significantly reduces what your plan includes.
      </p>

      <h2>10. Ending</h2>
      <ul>
        <li>You can stop using Appsy at any time by uninstalling it.</li>
        <li>
          We may suspend or end your access if you break these terms or the law,
          or if Shopify ends our access to your store.
        </li>
      </ul>

      <h2>11. Disclaimers</h2>
      <p>
        Appsy is provided &quot;as is&quot; and &quot;as available&quot;. As far
        as the law allows, we don&apos;t promise that it will be uninterrupted
        or free of errors, or that Apple or Google will accept your app.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        As far as the law allows, Scopegen isn&apos;t liable for indirect or
        consequential losses, such as lost profits, sales or data, and our total
        liability is limited to the fees you paid for Appsy in the 12 months
        before the claim.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. This page shows the date of the latest
        version, and we&apos;ll tell you in Appsy before significant changes
        take effect. Using Appsy after that means you accept them.
      </p>

      <h2>14. Governing law</h2>
      <p>
        [Governing law and courts, for example: the laws of India and the courts
        of [city]].
      </p>

      <h2>15. Contact</h2>
      <p>Questions about these terms: [contact email].</p>
    </LegalDocument>
  );
}
