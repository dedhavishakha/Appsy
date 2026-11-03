import { useAppBridge } from "@shopify/app-bridge-react";
import {
  appPolicyText,
  appPrivacyItems,
  dataSafetyItems,
} from "@appsy/app-config";
import type { PrivacyPolicy } from "../models/privacy-policy.server";

// What every store needs from Appsy for its app's privacy, on the Publishing page: the
// privacy policy link Google and Apple ask for, the section the store adds to that policy,
// the answers for Google Play's App content forms, and the answers for App Privacy in App
// Store Connect. The text and the answers come from what the app does
// (packages/app-config/src/privacy.ts), so they're the same for every store and change with
// the app. The rules behind them: Google's User Data policy, Data safety and App content
// help pages (checked 2026-10-27), and Apple's App Privacy Details page and App Store
// Connect help (checked 2026-11-02).

const GOOGLE_HELP = {
  userData:
    "https://support.google.com/googleplay/android-developer/answer/10144311",
  dataSafety:
    "https://support.google.com/googleplay/android-developer/answer/10787469",
  appContent:
    "https://support.google.com/googleplay/android-developer/answer/9859455",
};

const APPLE_HELP = {
  privacyDetails: "https://developer.apple.com/app-store/app-privacy-details/",
  managePrivacy:
    "https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy",
};

const SHOPIFY_HELP = {
  customerData:
    "https://help.shopify.com/en/manual/privacy-and-security/privacy/processing-customer-data-requests",
};

type Props = {
  appName: string;
  policy: PrivacyPolicy;
  // Whether each platform's app sends Google Analytics its events, and whether the app has
  // push notifications and shopper accounts (Functionality page), with the account deletion
  // page Google Play asks for.
  googleAnalytics: { android: boolean; ios: boolean };
  pushNotifications: boolean;
  accounts: { deletionPage: string; signInWithShop: boolean } | null;
};

export function PrivacyForms({
  appName,
  policy,
  googleAnalytics,
  pushNotifications,
  accounts,
}: Props) {
  const shopify = useAppBridge();
  const withAccounts = accounts !== null;
  const text = appPolicyText(appName, {
    googleAnalytics: googleAnalytics.android || googleAnalytics.ios,
    pushNotifications,
    accounts: withAccounts,
  });
  const items = dataSafetyItems({
    googleAnalytics: googleAnalytics.android,
    pushNotifications,
    accounts: withAccounts,
  });
  const appleItems = appPrivacyItems({
    googleAnalytics: googleAnalytics.ios,
    pushNotifications,
    accounts: withAccounts,
  });
  const providers = [
    "Appsy",
    "Shopify",
    ...(googleAnalytics.android ? ["Google Analytics"] : []),
    ...(pushNotifications ? ["Firebase Cloud Messaging"] : []),
  ];
  const handlers = `${providers.slice(0, -1).join(", ")} and ${providers[providers.length - 1]}`;

  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      shopify.toast.show(done);
    } catch {
      shopify.toast.show(
        "Couldn't copy. Select the text and copy it instead.",
        {
          isError: true,
        },
      );
    }
  };

  return (
    <s-section heading="Privacy, Google Play and App Store forms">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Google asks for its forms before your app can go beyond internal
          testing, and Apple for its App Privacy answers before your app is on
          the App Store. The answers come from what Appsy&apos;s app does, so
          you can use them as they are.
        </s-paragraph>

        <s-heading>1. Your privacy policy link</s-heading>
        {policy.status === "found" && (
          <s-stack gap="small">
            <s-paragraph>
              In Play Console, open Policy and programs › App content › Privacy
              policy and paste this link. It&apos;s the policy your app opens
              from Privacy choices in its menu. Apple asks for it too, under App
              Privacy (step 5).
            </s-paragraph>
            <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end">
              <s-text-field
                label="Privacy policy link"
                value={policy.url}
                readOnly
              />
              <s-button onClick={() => void copy(policy.url, "Link copied")}>
                Copy link
              </s-button>
            </s-grid>
          </s-stack>
        )}
        {policy.status === "missing" && (
          <s-banner tone="warning" heading="Your store has no privacy policy">
            <s-paragraph>
              Add one in Shopify under Settings › Policies. Apple and Google
              require one in every app, and you can&apos;t publish your design
              until you have one.
            </s-paragraph>
          </s-banner>
        )}
        {policy.status === "unavailable" && (
          <s-banner tone="warning">
            Appsy couldn&apos;t read your privacy policy from Shopify just now.
            Reload the page to try again.
          </s-banner>
        )}

        <s-divider />

        <s-heading>2. Add your app to your privacy policy</s-heading>
        <s-paragraph>
          Google says the policy must cover what your app collects, how
          it&apos;s kept safe and how long it&apos;s kept. In Shopify, open
          Settings › Policies, edit your privacy policy, paste this text at the
          end and save. If your policy is in another language, translate it.
        </s-paragraph>
        <s-text-area
          label="Text for your privacy policy"
          value={text}
          rows={12}
          readOnly
        />
        <s-stack direction="inline">
          <s-button onClick={() => void copy(text, "Text copied")}>
            Copy text
          </s-button>
        </s-stack>

        <s-divider />

        <s-heading>3. Data safety form</s-heading>
        <s-unordered-list>
          <s-list-item>
            Does your app collect or share required data types? Yes.
          </s-list-item>
          <s-list-item>Is all of it encrypted in transit? Yes.</s-list-item>
          {accounts ? (
            <s-list-item>
              Accounts: answer that your app lets users create an account.
              Shoppers sign in on your store&apos;s Shopify sign-in page, which
              creates their customer account the first time, and Google counts
              account creation outside the app too. As the link where users can
              ask for their account and data to be deleted, give your account
              deletion page below.
            </s-list-item>
          ) : (
            <s-list-item>
              Accounts: tick &quot;My app does not allow users to create an
              account&quot;, then answer No to &quot;Can users login to your app
              with accounts created outside of the app?&quot; Shoppers
              don&apos;t sign in to your app at all.
            </s-list-item>
          )}
          <s-list-item>
            Do you provide a way for users to request that their data is
            deleted? Yes: turning off usage data
            {pushNotifications ? " or notifications" : ""} in the app deletes
            what it sent
            {accounts
              ? ", Delete account in the app's Account tab and your account deletion page delete the shopper's account,"
              : ","}{" "}
            and shoppers can ask you about the rest through your privacy policy.
          </s-list-item>
        </s-unordered-list>
        {accounts && (
          <s-stack gap="small">
            <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end">
              <s-text-field
                label="Account deletion page"
                value={accounts.deletionPage}
                readOnly
              />
              <s-button
                onClick={() => void copy(accounts.deletionPage, "Link copied")}
              >
                Copy link
              </s-button>
            </s-grid>
            <s-paragraph color="subdued">
              It names your app, says what&apos;s deleted and kept, and gives
              your store&apos;s public contact email for shoppers without the
              app. When one writes to you, erase their personal data in Shopify,
              on the customer&apos;s page; Shopify explains how in{" "}
              <s-link href={SHOPIFY_HELP.customerData} target="_blank">
                Processing customer data requests
              </s-link>
              .
            </s-paragraph>
          </s-stack>
        )}
        <s-paragraph>
          Under Data types, tick these {items.length} and nothing else.
          They&apos;re in the order Play Console lists them. Under Data usage
          and handling, mark each one as collected, not shared and not processed
          ephemerally, with the purposes and choice shown here. {handlers}{" "}
          handle the data for you as service providers, which Google
          doesn&apos;t count as sharing.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Data type</s-table-header>
            <s-table-header listSlot="secondary">
              What your app sends
            </s-table-header>
            <s-table-header listSlot="labeled">Purposes</s-table-header>
            <s-table-header listSlot="labeled">
              Shoppers can choose
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {items.map((item) => (
              <s-table-row key={item.type}>
                <s-table-cell>
                  {item.category === item.type
                    ? item.type
                    : `${item.category} › ${item.type}`}
                </s-table-cell>
                <s-table-cell>{item.what}</s-table-cell>
                <s-table-cell>{item.purposes.join(", ")}</s-table-cell>
                <s-table-cell>
                  {item.optional ? "Yes" : "No (required)"}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        <s-paragraph>
          If you send offers to shoppers who agree to them at checkout, also
          tick Advertising or marketing for Email address, and for Phone number
          if you send offers by text.
        </s-paragraph>

        <s-divider />

        <s-heading>4. The other App content answers</s-heading>
        <s-unordered-list>
          <s-list-item>
            <s-text type="strong">Ads:</s-text> No, unless you add ads.
            Appsy&apos;s app has no ad networks, and your banners and products
            are your store&apos;s own content.
          </s-list-item>
          {accounts ? (
            <s-list-item>
              <s-text type="strong">Sign-in details:</s-text> everything works
              without signing in except the Account tab, so answer that part of
              your app is restricted, and tell Google how to sign in: on the
              Account tab, with any email address they can read. Shopify emails
              a 6-digit code and creates the account the first time. No content
              requires payment: shoppers pay only for your products, at
              checkout.
            </s-list-item>
          ) : (
            <s-list-item>
              <s-text type="strong">Sign-in details:</s-text> answer No to
              &quot;Is any part of your app restricted?&quot; No part of your
              app needs a login, and no content requires payment: shoppers pay
              only for your products, at checkout.
            </s-list-item>
          )}
          <s-list-item>
            <s-text type="strong">Target audience:</s-text> choose your
            shoppers&apos; age groups: usually 13–15, 16–17 and 18 and over, or
            only 18 and over if you sell age-restricted products. Leave out the
            groups under 13: Appsy&apos;s app isn&apos;t made for children, and
            including them brings Google&apos;s Families policy.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Content rating:</s-text> answer the
            questionnaire for what your app shows, including your products.
            &quot;Online content&quot; is Yes: your products load from your
            store, like Google&apos;s own example, &quot;product listings in the
            Amazon Shopping app&quot;. Age-restricted products are Yes only if
            you sell any. Gambling, prizes and cash rewards are No: Appsy&apos;s
            app gives no rewards, discount codes are just lower prices, and gift
            cards you sell are products. A wrong Yes there gives your app an 18+
            rating.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">News apps and COVID-19 apps:</s-text> No.
          </s-list-item>
        </s-unordered-list>
        <s-paragraph color="subdued">
          From Google:{" "}
          <s-link href={GOOGLE_HELP.userData} target="_blank">
            User Data policy
          </s-link>
          ,{" "}
          <s-link href={GOOGLE_HELP.dataSafety} target="_blank">
            Data safety
          </s-link>{" "}
          and{" "}
          <s-link href={GOOGLE_HELP.appContent} target="_blank">
            App content
          </s-link>
          .
        </s-paragraph>

        <s-divider />

        <s-heading>5. App Privacy in App Store Connect</s-heading>
        <s-paragraph>
          In App Store Connect, open your app, click App Privacy in the sidebar,
          then Get Started. Choose &quot;Yes, we collect data from this
          app&quot;, then choose these {appleItems.length} data types and
          nothing else. For each one, choose the purposes shown and whether
          it&apos;s linked to the shopper, and answer No to tracking:
          Appsy&apos;s app doesn&apos;t link shoppers&apos; data with other
          companies&apos; data for advertising, or share it with data brokers.
          Then click Publish.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Data type</s-table-header>
            <s-table-header listSlot="secondary">
              What your app sends
            </s-table-header>
            <s-table-header listSlot="labeled">Purposes</s-table-header>
            <s-table-header listSlot="labeled">
              Linked to the shopper
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {appleItems.map((item) => (
              <s-table-row key={`${item.category} › ${item.type}`}>
                <s-table-cell>
                  {item.category === item.type
                    ? item.type
                    : `${item.category} › ${item.type}`}
                </s-table-cell>
                <s-table-cell>{item.what}</s-table-cell>
                <s-table-cell>{item.purposes.join(", ")}</s-table-cell>
                <s-table-cell>{item.linked ? "Yes" : "No"}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        <s-paragraph>
          If you send offers to shoppers who agree to them at checkout, also
          choose Developer&apos;s Advertising or Marketing for Email Address,
          and for Phone Number if you send offers by text. Then, next to Privacy
          Policy, click Edit and enter your privacy policy link from step 1.
        </s-paragraph>
        {accounts && (
          <s-paragraph>
            For App Review, tell Apple in your app&apos;s App Review Information
            that signing in is optional and needs no password: on the Account
            tab, reviewers sign in with any email address they can read, Shopify
            emails a 6-digit code and creates the account the first time, and
            Delete account is on the same tab.
            {accounts.signInWithShop
              ? " Add that the sign-in page is your store's own Shopify customer account sign-in, where Shopify, the platform your store runs on, also offers Sign in with Shop."
              : ""}
          </s-paragraph>
        )}
        <s-paragraph color="subdued">
          Apple counts what your app&apos;s web pages collect too, such as your
          checkout: if apps or pixels in your checkout collect shoppers&apos;
          data, add what they collect. If you turn on Google signals or link
          Google Ads in Google Analytics, Google says your answers may change.
          Apple lets you update these answers at any time, without a new version
          of your app.
        </s-paragraph>
        <s-paragraph color="subdued">
          From Apple:{" "}
          <s-link href={APPLE_HELP.privacyDetails} target="_blank">
            App Privacy Details
          </s-link>{" "}
          and{" "}
          <s-link href={APPLE_HELP.managePrivacy} target="_blank">
            Manage app privacy
          </s-link>
          .
        </s-paragraph>
      </s-stack>
    </s-section>
  );
}
