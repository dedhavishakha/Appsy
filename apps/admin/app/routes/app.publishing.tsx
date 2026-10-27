import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppBuilds } from "../components/app-builds";
import { AppIdentity } from "../components/app-identity";
import { PrivacyForms } from "../components/privacy-forms";
import { StoreAccountsSection } from "../components/store-accounts";
import { authenticate } from "../shopify.server";
import type { BuildIntent, BuildResult } from "../models/builds";
import { loadBuilds, startBuild, uploadAgain } from "../models/builds.server";
import { loadIdentity, saveIdentity } from "../models/identity.server";
import type { IdentityIssue } from "../models/identity";
import { loadPrivacyPolicy } from "../models/privacy-policy.server";
import { ensureShopSetup } from "../models/shop.server";
import type { StoreIntent, StoreResult } from "../models/store-accounts";
import {
  connectApple,
  connectGoogle,
  disconnect,
  loadStoreAccounts,
  registerBundle,
  saveAppId,
  saveAscAppId,
} from "../models/store-accounts.server";

// Publishing: the app's name, icon and splash screen (components/app-identity.tsx), the
// App ID and store accounts Appsy builds and uploads with (components/store-accounts.tsx),
// building the app and uploading it for testing (components/app-builds.tsx), then how
// merchants publish their app on the App Store and Google Play, with the wait times and
// requirements (App Store requirement 5.9.2), and the privacy answers Google asks for
// (components/privacy-forms.tsx). Store listings are the merchant's, filled in App Store
// Connect and Play Console themselves (decided 2026-10-22). The guide's source is docs/06;
// every figure links to the official page it comes from (checked 2026-10-21).

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  // As in the editor: pictures need read_files, which a store has once it approves the
  // update that added it. If Shopify can't say what's granted, try.
  const granted = await scopes
    .query()
    .then((result) => result.granted)
    .catch((error) => {
      console.error(`Scopes for ${session.shop}:`, error);
      return null;
    });
  const filesAccess =
    granted === null ||
    ["read_files", "write_files"].some((name) => granted.includes(name));
  const [identity, store, builds, privacyPolicy] = await Promise.all([
    loadIdentity(shop.appProject.id),
    loadStoreAccounts(shop.appProject.id, session.shop),
    loadBuilds(shop.appProject.id),
    loadPrivacyPolicy(shop),
  ]);
  return { identity, store, builds, privacyPolicy, filesAccess };
};

// Each part of the page posts its own intent: "identity" for the name and icon, the
// build ones for building and uploading, the others for the App ID and store accounts.
export const action = async ({
  request,
}: ActionFunctionArgs): Promise<
  { issues: IdentityIssue[] } | StoreResult | BuildResult
> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "identity");
  if (intent === "build-android" || intent === "upload-again") {
    return buildAction(
      intent,
      shop.appProject.id,
      form,
      sessionToken?.sub ?? null,
      session.shop,
    );
  }
  if (intent !== "identity") {
    return storeAction(
      intent as StoreIntent,
      shop.appProject.id,
      form,
      session.shop,
    );
  }
  let settings: unknown = null;
  try {
    settings = JSON.parse(String(form.get("settings")));
  } catch {
    // Reported as missing choices by saveIdentity.
  }
  try {
    return {
      issues: await saveIdentity(admin, shop.appProject.id, {
        appName: form.get("appName"),
        settings,
      }),
    };
  } catch (error) {
    // An expired or invalid token: App Bridge retries with a fresh one.
    if (error instanceof Response) throw error;
    console.error(`App name and icon for ${session.shop}:`, error);
    return {
      issues: [
        {
          field: null,
          message: "Appsy couldn't save these. Please try again.",
        },
      ],
    };
  }
};

async function buildAction(
  intent: BuildIntent,
  appProjectId: string,
  form: FormData,
  createdBy: string | null,
  shopDomain: string,
): Promise<BuildResult> {
  try {
    const result =
      intent === "build-android"
        ? await startBuild(appProjectId, createdBy)
        : await uploadAgain(appProjectId, form.get("buildId"));
    return { intent, ...result };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`Builds (${intent}) for ${shopDomain}:`, error);
    return {
      intent,
      issues: [
        { message: "Appsy couldn't do that just now. Please try again." },
      ],
    };
  }
}

async function storeAction(
  intent: StoreIntent,
  appProjectId: string,
  form: FormData,
  shopDomain: string,
): Promise<StoreResult> {
  try {
    const result = await (() => {
      switch (intent) {
        case "app-id":
          return saveAppId(appProjectId, form.get("appId"));
        case "apple":
          return connectApple(appProjectId, form);
        case "apple-app":
          return saveAscAppId(appProjectId, form.get("ascAppId"));
        case "register-bundle":
          return registerBundle(appProjectId);
        case "google":
          return connectGoogle(appProjectId, form);
        case "disconnect-apple":
          return disconnect(appProjectId, "apple");
        case "disconnect-google":
          return disconnect(appProjectId, "google");
        default:
          return {
            issues: [{ field: null, message: `Unknown action "${intent}"` }],
          };
      }
    })();
    return { intent, ...result };
  } catch (error) {
    if (error instanceof Response) throw error;
    // Never logs the form: it can hold keys.
    console.error(`Store accounts (${intent}) for ${shopDomain}:`, error);
    return {
      intent,
      issues: [
        {
          field: null,
          message: "Appsy couldn't do that just now. Please try again.",
        },
      ],
    };
  }
}

const WAIT_TIMES = [
  {
    step: "D-U-N-S number, needed for organization accounts",
    wait: "Can take up to 30 days",
    source: "Google Play",
    href: "https://support.google.com/googleplay/android-developer/answer/13628312",
  },
  {
    step: "Google Play personal accounts created after November 13, 2023",
    wait: "A closed test with at least 12 testers, opted in for at least 14 days, before you can apply for production",
    source: "Google Play",
    href: "https://support.google.com/googleplay/android-developer/answer/14151465",
  },
  {
    step: "TestFlight processing after Appsy uploads your app",
    wait: "Usually 10–15 minutes",
    source: "Expo",
    href: "https://docs.expo.dev/submit/ios/",
  },
  {
    step: "Apple App Review",
    wait: "At least 50% of submissions in less than 24 hours, and 90% in less than 48 hours",
    source: "Apple",
    href: "https://developer.apple.com/distribute/app-review/",
  },
  {
    // Google's pages we read state no review time, so this row has no source link.
    step: "Google Play review",
    wait: "Google doesn't state a fixed time. Play Console shows your app's status",
    source: null,
    href: null,
  },
];

export default function Publishing() {
  const { identity, store, builds, privacyPolicy, filesAccess } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Publishing your app">
      <AppIdentity
        appName={identity.appName}
        settings={identity.settings}
        filesAccess={filesAccess}
      />

      <StoreAccountsSection
        appId={store.appId}
        suggestedAppId={store.suggestedAppId}
        accounts={store.accounts}
      />

      <AppBuilds android={builds.android} builds={builds.builds} />

      <s-banner tone="info" heading="Start your developer accounts early">
        <s-paragraph>
          Organization accounts can take weeks, mostly waiting for a D-U-N-S
          number. You can design your app in Appsy in the meantime.
        </s-paragraph>
      </s-banner>

      <s-section>
        <s-paragraph>
          Your app is published on Apple&apos;s App Store and Google Play under
          your own developer accounts, so your business shows as its developer.
          Appsy builds your app and uploads it for testing. A few steps only you
          can do in Apple&apos;s and Google&apos;s consoles: creating the app,
          completing its store listing and privacy answers, and sending it for
          review.
        </s-paragraph>
      </s-section>

      <s-section heading="Wait times">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Step</s-table-header>
            <s-table-header>How long</s-table-header>
            <s-table-header>Source</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {WAIT_TIMES.map((row) => (
              <s-table-row key={row.step}>
                <s-table-cell>{row.step}</s-table-cell>
                <s-table-cell>{row.wait}</s-table-cell>
                <s-table-cell>
                  {row.href ? (
                    <s-link href={row.href} target="_blank">
                      {row.source}
                    </s-link>
                  ) : (
                    "—"
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="What you need">
        <s-stack gap="base">
          <s-paragraph>
            <s-text type="strong">Apple:</s-text> the{" "}
            <s-link
              href="https://developer.apple.com/programs/enroll/"
              target="_blank"
            >
              Apple Developer Program
            </s-link>
            , 99 USD per membership year. Organizations also need a legal
            entity, a D-U-N-S number, a public website on their own domain, and
            a person with authority to sign for them.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Google:</s-text> a{" "}
            <s-link
              href="https://support.google.com/googleplay/android-developer/answer/13628312"
              target="_blank"
            >
              Play Console developer account
            </s-link>
            , with a one-time fee shown when you sign up. Organizations also
            need a D-U-N-S number, a linked Google Payments profile, a website,
            a phone number and an email address.
          </s-paragraph>
          <s-paragraph color="subdued">
            We recommend organization accounts on both stores: your business
            name shows on your app, and Google&apos;s 14-day testing rule for
            new personal accounts doesn&apos;t apply.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Apple App Store">
        <s-ordered-list>
          <s-list-item>
            Join the Apple Developer Program. The Account Holder accepts the
            latest agreement in App Store Connect&apos;s Business section.
          </s-list-item>
          <s-list-item>
            Create an App Store Connect API key so Appsy can build and upload
            your app: in Users and Access, open Integrations, then App Store
            Connect API, and generate a team key with the Admin role. Download
            the .p8 file straight away: Apple lets you download it only once.
            Enter it under Store accounts above, with your Issuer ID, Key ID and
            Team ID.
          </s-list-item>
          <s-list-item>
            Register your App ID with Apple from Store accounts above. Then
            create your app in App Store Connect: in Apps, click the add button
            (+) and choose New App. Choose iOS, enter your app&apos;s name and
            language, choose your App ID as the bundle ID, enter any unique SKU,
            then click Create. Add the app&apos;s Apple ID under Store accounts.
          </s-list-item>
          <s-list-item>
            When Appsy has uploaded your app to TestFlight, complete the product
            page (description, keywords, screenshots), the App Privacy answers,
            the age rating and your privacy policy link. Then select the build
            and submit it for review.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="Google Play">
        <s-ordered-list>
          <s-list-item>
            In Play Console, choose Create app. Enter your app&apos;s name and
            default language, choose app and free, add a support email, accept
            the declarations, then click Create app.
          </s-list-item>
          <s-list-item>
            Let Appsy upload your app: create a service account in Google Cloud
            with a JSON key, enable the Google Play Android Developer API, and
            invite the service account in Play Console&apos;s Users and
            permissions with release permissions for your app. Upload the JSON
            key file under Store accounts above.
          </s-list-item>
          <s-list-item>
            Click Build Android app under Build and upload above. Appsy builds
            your app and uploads it to the internal testing track, where your
            testers (up to 100) install it from Google Play.
          </s-list-item>
          <s-list-item>
            Complete the dashboard tasks: app content, with the answers under
            Privacy and Google Play forms below, and the store listing (a name
            of up to 30 characters, a short description of up to 80 and a full
            description of up to 4,000).
          </s-list-item>
          <s-list-item>
            Personal account created after November 13, 2023? Run a closed test
            with at least 12 testers for 14 days, then apply for production
            access.
          </s-list-item>
          <s-list-item>
            Promote the release to production and send it for review.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      <PrivacyForms appName={identity.appName} policy={privacyPolicy} />

      <s-section heading="Keeping your app up to date">
        <s-paragraph>
          Apple and Google raise their technical requirements every year. Appsy
          rebuilds your app to meet them and uploads the update, and you submit
          it for review in each console.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
