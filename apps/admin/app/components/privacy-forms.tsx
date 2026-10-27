import { useAppBridge } from "@shopify/app-bridge-react";
import { appPolicyText, DATA_SAFETY_ITEMS } from "@appsy/app-config";
import type { PrivacyPolicy } from "../models/privacy-policy.server";

// What every store needs from Appsy for its app's privacy, on the Publishing page: the
// privacy policy link Google and Apple ask for, the section the store adds to that policy,
// and the answers for Google Play's App content forms. The text and the Data safety
// answers come from what the app does (packages/app-config/src/privacy.ts), so they're
// the same for every store and change with the app. Google's rules behind them: the User
// Data policy, Data safety and App content help pages (checked 2026-10-27).

const GOOGLE_HELP = {
  userData:
    "https://support.google.com/googleplay/android-developer/answer/10144311",
  dataSafety:
    "https://support.google.com/googleplay/android-developer/answer/10787469",
  appContent:
    "https://support.google.com/googleplay/android-developer/answer/9859455",
};

type Props = { appName: string; policy: PrivacyPolicy };

export function PrivacyForms({ appName, policy }: Props) {
  const shopify = useAppBridge();
  const text = appPolicyText(appName);

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
    <s-section heading="Privacy and Google Play forms">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Google asks for these before your app can go beyond internal testing.
          The answers come from what Appsy&apos;s app does, so you can use them
          as they are.
        </s-paragraph>

        <s-heading>1. Your privacy policy link</s-heading>
        {policy.status === "found" && (
          <s-stack gap="small">
            <s-paragraph>
              In Play Console, open Policy and programs › App content › Privacy
              policy and paste this link. It&apos;s the policy your app opens
              from Privacy choices in its menu, and Apple asks for it too.
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
          <s-list-item>
            Can people ask for their data to be deleted? Yes: turning off usage
            data in the app deletes it, and shoppers can ask you about the rest
            through your privacy policy.
          </s-list-item>
          <s-list-item>
            Accounts: shoppers can&apos;t create an account in your app.
          </s-list-item>
        </s-unordered-list>
        <s-paragraph>
          Then mark these as collected, not shared, and not processed
          ephemerally. Appsy and Shopify handle the data for you as service
          providers, which Google doesn&apos;t count as sharing.
        </s-paragraph>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Data type</s-table-header>
            <s-table-header listSlot="secondary">
              What your app sends
            </s-table-header>
            <s-table-header listSlot="labeled">Purpose</s-table-header>
            <s-table-header listSlot="labeled">
              Shoppers can choose
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {DATA_SAFETY_ITEMS.map((item) => (
              <s-table-row key={item.type}>
                <s-table-cell>
                  {item.category === item.type
                    ? item.type
                    : `${item.category} › ${item.type}`}
                </s-table-cell>
                <s-table-cell>{item.what}</s-table-cell>
                <s-table-cell>{item.purpose}</s-table-cell>
                <s-table-cell>
                  {item.optional ? "Yes" : "No (required)"}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        <s-divider />

        <s-heading>4. The other App content answers</s-heading>
        <s-unordered-list>
          <s-list-item>
            <s-text type="strong">Ads:</s-text> No, unless you add ads.
            Appsy&apos;s app has no ad networks, and your banners and products
            are your store&apos;s own content.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Sign-in details:</s-text> nothing to add. No
            part of your app needs a login.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Target audience:</s-text> choose your
            shoppers&apos; age groups. Including children under 13 brings
            Google&apos;s Families policy.
          </s-list-item>
          <s-list-item>
            <s-text type="strong">Content rating:</s-text> answer the
            questionnaire for what your app shows, including your products.
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
      </s-stack>
    </s-section>
  );
}
