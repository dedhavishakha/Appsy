import { useEffect, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  appCodeStart,
  GA4_FEATURE,
  PUSH_FEATURE,
  pushOn,
  savedCodeStart,
  savedSizeChartSettings,
  setSizeChartSettings,
  shopifyGid,
  SIZE_CHART_FEATURE,
  SIZE_CHART_MATCHES,
  sizeChartSettings,
  switchAppCodes,
  switchFeature,
  withoutSizeChart,
  type AppDesign,
  type DesignIssue,
  type SizeChartMatch,
  type SizeChartRule,
  type SizeChartSettings,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { applySetting, loadDesign } from "../models/design.server";
import { storefrontQuery } from "../models/storefront.server";
import {
  hasDiscountsAccess,
  loadAppCodes,
  newCodeStart,
  type AppCode,
  type AppCodeList,
} from "../models/app-codes.server";
import {
  deleteSizeChart,
  listSizeCharts,
  loadRuleTitles,
  type SizeChartSummary,
} from "../models/size-charts.server";
import {
  loadFirebase,
  loadFirebaseIos,
  removeFirebase,
  removeFirebaseIos,
  saveFirebase,
  saveFirebaseIos,
  type FirebaseConnection,
  type FirebaseIosConnection,
} from "../models/google-analytics.server";
import {
  cancelScheduled,
  connectApnsKey,
  connectPushKey,
  loadPushKeys,
  removeApnsKey,
  removePushKey,
  type AppleKeyStatus,
  type PushKeys,
} from "../models/push.server";
import { storeAccountsSchema } from "../models/store-accounts";

// Functionality: what the merchant's app can do for shoppers. Each switch takes effect in
// the app at once, apart from the design they edit and publish in the editor.

// Each change this page makes (see settingChange). "newCodeStart" gives the store a new
// code start for app-only discount codes and keeps them on; "sizeChartSettings" says which
// products use which size chart; "deleteSizeChart" deletes one and forgets it. The file
// changes keep or remove the merchant's Firebase files (google-services.json,
// GoogleService-Info.plist) and push notification keys (Firebase, APNs), not the design.
// The bag reminder became an automatic notification on the Push notifications page
// (2026-11-02).
const SETTINGS = [
  "appCodes",
  "sizeCharts",
  "googleAnalytics",
  "pushNotifications",
  "currencyConversion",
  "wishlist",
  "newCodeStart",
  "sizeChartSettings",
  "deleteSizeChart",
  "uploadGoogleServices",
  "removeGoogleServices",
  "uploadGoogleServicesIos",
  "removeGoogleServicesIos",
  "uploadPushKey",
  "removePushKey",
  "uploadApnsKey",
  "removeApnsKey",
] as const;

type SettingName = (typeof SETTINGS)[number];
type FileChange =
  | "uploadGoogleServices"
  | "removeGoogleServices"
  | "uploadGoogleServicesIos"
  | "removeGoogleServicesIos"
  | "uploadPushKey"
  | "removePushKey"
  | "uploadApnsKey"
  | "removeApnsKey";
const FILE_CHANGES: readonly string[] = [
  "uploadGoogleServices",
  "removeGoogleServices",
  "uploadGoogleServicesIos",
  "removeGoogleServicesIos",
  "uploadPushKey",
  "removePushKey",
  "uploadApnsKey",
  "removeApnsKey",
];

const MARKETS_QUERY = `#graphql
  query AppsyMarkets {
    localization {
      availableCountries { isoCode name currency { isoCode } }
    }
    shop { paymentSettings { currencyCode } }
  }`;

type MarketsData = {
  localization: {
    availableCountries: {
      isoCode: string;
      name: string;
      currency: { isoCode: string };
    }[];
  };
  shop: { paymentSettings: { currencyCode: string } };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const design = await loadDesign(shop.appProject.id);
  const codeStart = appCodeStart(design);
  const [markets, discountsAccess] = await Promise.all([
    // The store's Shopify Markets, read the way phones read them (Appsy's Storefront token).
    shop.storefrontToken
      ? storefrontQuery<MarketsData>(
          shop.shopDomain,
          shop.storefrontToken,
          MARKETS_QUERY,
        ).catch((error) => {
          console.error(`Markets for ${session.shop}:`, error);
          return null;
        })
      : null,
    // read_discounts is an optional scope: only stores using app-only codes grant it.
    codeStart ? hasDiscountsAccess(scopes) : false,
  ]);
  const appCodes: AppCodeList | null =
    codeStart && discountsAccess ? await loadAppCodes(admin, codeStart) : null;
  const sizeCharts = design.features[SIZE_CHART_FEATURE]?.enabled === true;
  const sizeChartChoices = savedSizeChartSettings(design);
  const [charts, ruleTitles] = sizeCharts
    ? await Promise.all([
        listSizeCharts(admin),
        loadRuleTitles(
          admin,
          sizeChartChoices.rules
            .filter(
              (rule) => rule.match === "product" || rule.match === "collection",
            )
            .map((rule) => rule.value),
        ),
      ])
    : [null, {}];
  const googleAnalytics = design.features[GA4_FEATURE]?.enabled === true;
  const pushNotifications = pushOn(design);
  // Google Analytics and Android push notifications share the app's Firebase project.
  const [firebase, firebaseIos, pushKeys] = await Promise.all([
    googleAnalytics || pushNotifications
      ? loadFirebase(shop.appProject.id)
      : null,
    googleAnalytics ? loadFirebaseIos(shop.appProject.id) : null,
    pushNotifications ? loadPushKeys(shop.appProject.id) : null,
  ]);
  // An APNs key belongs to the Apple team of the store's App Store account.
  const accounts = storeAccountsSchema.safeParse(
    shop.appProject.storeAccounts ?? {},
  );
  return {
    codeStart,
    discountsAccess,
    appCodes,
    sizeCharts,
    sizeChartChoices,
    charts,
    ruleTitles,
    googleAnalytics,
    firebase,
    firebaseIos,
    pushNotifications,
    pushKeys,
    appleTeamId: (accounts.success && accounts.data.apple?.teamId) || null,
    appId: shop.appProject.androidPackage,
    currencyConversion: design.markets.displayCurrencyConversion,
    wishlist: design.features.wishlist?.enabled === true,
    countries: markets?.localization.availableCountries ?? [],
    shopCurrency: markets?.shop.paymentSettings.currencyCode ?? null,
  };
};

const refused = (message: string) => ({
  issues: [{ path: [], message }] as DesignIssue[],
});

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// One change, as what it does to the design (applySetting gives it to the live design and
// the editor's draft), or why it can't happen.
async function settingChange(
  setting: Exclude<SettingName, FileChange>,
  value: string,
  appProjectId: string,
  admin: Parameters<typeof deleteSizeChart>[0],
): Promise<((design: AppDesign) => AppDesign) | { issues: DesignIssue[] }> {
  const on = value === "on";
  switch (setting) {
    case "googleAnalytics":
      return (design) => switchFeature(design, GA4_FEATURE, on);
    case "pushNotifications":
      return (design) => switchFeature(design, PUSH_FEATURE, on);
    case "currencyConversion":
      return (design) => ({
        ...design,
        markets: { ...design.markets, displayCurrencyConversion: on },
      });
    case "wishlist":
      return (design) => switchFeature(design, "wishlist", on);
    case "sizeCharts":
      return (design) => switchFeature(design, SIZE_CHART_FEATURE, on);
    case "appCodes":
    case "newCodeStart": {
      // Worked out once, so the live design and the draft get the same start. Switching
      // app-only codes off and on again keeps it.
      const saved = savedCodeStart(await loadDesign(appProjectId));
      const renew = setting === "newCodeStart";
      const start = renew || !saved ? newCodeStart(saved) : saved;
      return (design) => switchAppCodes(design, renew || on, start);
    }
    case "sizeChartSettings": {
      const choices = sizeChartSettings.safeParse(parseJson(value));
      if (!choices.success)
        return refused("Those size chart choices aren't valid.");
      return (design) => setSizeChartSettings(design, choices.data);
    }
    case "deleteSizeChart": {
      const chart = shopifyGid("Metaobject").safeParse(value);
      if (!chart.success) return refused("That size chart doesn't exist.");
      const problems = await deleteSizeChart(admin, chart.data);
      if (problems.length > 0)
        return { issues: problems.map((message) => ({ path: [], message })) };
      return (design) =>
        setSizeChartSettings(
          design,
          withoutSizeChart(savedSizeChartSettings(design), chart.data),
        );
    }
  }
}

type ActionResult = {
  setting: string;
  issues: DesignIssue[];
  live: boolean;
  on: boolean;
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const setting = String(form.get("setting"));
  const value = String(form.get("value") ?? "");
  const on = value === "on";
  if (!(SETTINGS as readonly string[]).includes(setting)) {
    return {
      setting,
      issues: [{ path: [], message: `Unknown setting "${setting}"` }],
      live: false,
      on,
    };
  }
  // The merchant's Firebase files, kept on the app and reaching phones with the next build,
  // and their push notification keys, kept in the vault for sending campaigns.
  if (FILE_CHANGES.includes(setting)) {
    let problems: string[] = [];
    switch (setting as FileChange) {
      case "uploadGoogleServices":
        problems = await saveFirebase(
          shop.appProject.id,
          shop.appProject.androidPackage,
          value,
        );
        break;
      case "removeGoogleServices":
        await removeFirebase(shop.appProject.id);
        break;
      case "uploadGoogleServicesIos":
        problems = await saveFirebaseIos(
          shop.appProject.id,
          shop.appProject.iosBundleId,
          value,
        );
        break;
      case "removeGoogleServicesIos":
        await removeFirebaseIos(shop.appProject.id);
        break;
      case "uploadPushKey":
        problems = await connectPushKey(shop.appProject.id, value);
        break;
      case "removePushKey":
        await removePushKey(shop.appProject.id);
        break;
      case "uploadApnsKey":
        problems = await connectApnsKey(
          shop.appProject.id,
          String(form.get("keyId") ?? ""),
          value,
        );
        break;
      case "removeApnsKey":
        await removeApnsKey(shop.appProject.id);
        break;
    }
    return {
      setting,
      issues: problems.map((message) => ({ path: [], message })),
      live: false,
      on,
    };
  }
  const change = await settingChange(
    setting as Exclude<SettingName, FileChange>,
    value,
    shop.appProject.id,
    admin,
  );
  if ("issues" in change) {
    return { setting, issues: change.issues, live: false, on };
  }
  const result = await applySetting(
    admin,
    shop,
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_APP_URL ?? "",
    change,
    sessionToken?.sub ?? null,
  );
  // Switched off, nothing scheduled goes out.
  if (setting === "pushNotifications" && !on && result.issues.length === 0) {
    await cancelScheduled(
      shop.appProject.id,
      "Not sent: push notifications were turned off.",
    );
  }
  return { setting, issues: result.issues, live: result.live, on };
};

export default function Functionality() {
  const {
    codeStart,
    discountsAccess,
    appCodes,
    sizeCharts,
    sizeChartChoices,
    charts,
    ruleTitles,
    googleAnalytics,
    firebase,
    firebaseIos,
    pushNotifications,
    pushKeys,
    appleTeamId,
    appId,
    currencyConversion,
    wishlist,
    countries,
    shopCurrency,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Functionality">
      <s-section heading="App-only discount codes">
        <SettingSwitch
          setting="appCodes"
          label="App-only discount codes"
          details="Discount codes that work in your app, but not on your website."
          checked={codeStart !== null}
        >
          {codeStart && (
            <AppCodes
              start={codeStart}
              access={discountsAccess}
              list={appCodes}
            />
          )}
        </SettingSwitch>
      </s-section>

      <s-section heading="Size charts">
        <SettingSwitch
          setting="sizeCharts"
          label="Size charts"
          details="A Size chart link under each product's options, with the chart for that product."
          checked={sizeCharts}
        >
          {sizeCharts && (
            <SizeCharts
              charts={charts}
              choices={sizeChartChoices}
              titles={ruleTitles}
            />
          )}
        </SettingSwitch>
      </s-section>

      <s-section heading="Google Analytics">
        <SettingSwitch
          setting="googleAnalytics"
          label="Google Analytics"
          details="Your app's shopping events in your own Google Analytics, next to your website's, after each shopper allows usage data."
          checked={googleAnalytics}
        >
          {googleAnalytics && (
            <GoogleAnalytics
              appId={appId}
              connection={firebase}
              iosConnection={firebaseIos}
            />
          )}
        </SettingSwitch>
      </s-section>

      <s-section heading="Push notifications">
        <SettingSwitch
          setting="pushNotifications"
          label="Push notifications"
          details="Send offers and news to shoppers' phones, and remind them about items left in their bag. Your app asks each shopper first."
          checked={pushNotifications}
        >
          {pushNotifications && (
            <PushNotifications
              appId={appId}
              firebase={firebase}
              keys={pushKeys ?? { firebase: null, apple: null }}
              appleTeamId={appleTeamId}
              googleAnalytics={googleAnalytics}
            />
          )}
        </SettingSwitch>
      </s-section>

      <s-section heading="Wishlist">
        <SettingSwitch
          setting="wishlist"
          label="Wishlist"
          details="Shoppers save products with a heart and find them in the Wishlist tab, with today's prices."
          checked={wishlist}
        >
          <s-paragraph color="subdued">
            Each shopper&apos;s list is kept on their phone. Once shoppers can
            sign in, it&apos;s also kept in their store account, so it follows
            them to a new phone.
          </s-paragraph>
        </SettingSwitch>
      </s-section>

      <s-section heading="Currency">
        <SettingSwitch
          setting="currencyConversion"
          label="Currency conversion"
          details="Shoppers can pick any currency, and prices are converted for display with daily exchange rates. Checkout still charges each market's currency, and the app's bag says so."
          checked={currencyConversion}
        >
          <s-paragraph color="subdued">
            Prices always come from Shopify: each market&apos;s own price, as on
            your online store. Conversion only changes the currency they&apos;re
            shown in.
          </s-paragraph>
          <s-paragraph color="subdued">
            {countries.length > 0
              ? `Your store sells to ${countries
                  .map(
                    (country) =>
                      `${country.name} (${country.currency.isoCode})`,
                  )
                  .join(
                    ", ",
                  )} through Shopify Markets. Shoppers choose where their order ships from these.`
              : "Appsy couldn't read your store's markets right now."}
            {shopCurrency
              ? ` Your store's main currency is ${shopCurrency}.`
              : ""}
          </s-paragraph>
          <s-paragraph color="subdued">
            Exchange rates by{" "}
            <s-link href="https://www.exchangerate-api.com" target="_blank">
              Exchange Rate API
            </s-link>
            , free and updated daily.
          </s-paragraph>
        </SettingSwitch>
      </s-section>
    </s-page>
  );
}

const STATUS: Record<
  AppCode["status"],
  { label: string; tone: "success" | "info" | "neutral" }
> = {
  ACTIVE: { label: "Active", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

// The store's code start, how to make an app-only code, and the codes made with it.
// Shopify's own discount pages open on top of Appsy (Intents API). Listing the codes needs
// read_discounts, an optional scope the store grants here (Scopes API); the codes work in
// the app without it.
function AppCodes({
  start,
  access,
  list,
}: {
  start: string;
  access: boolean;
  list: AppCodeList | null;
}) {
  const shopify = useAppBridge();
  const { revalidate } = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const renewing = fetcher.state !== "idle";
  const result = renewing ? undefined : fetcher.data;
  const prefix = `${start}-`;
  const example = `${prefix}POTLI`;

  useEffect(() => {
    if (result && result.issues.length === 0) {
      shopify.toast.show(
        result.live
          ? "Your app now uses your new code start"
          : "Saved. Your app gets it when you first publish its design.",
      );
    }
  }, [result, shopify]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prefix);
      shopify.toast.show("Code start copied");
    } catch {
      shopify.toast.show(
        "Couldn't copy. Select the code start and copy it instead.",
        { isError: true },
      );
    }
  };

  // Without an id, Shopify asks which kind of discount to create.
  const openDiscount = async (id?: string) => {
    if (!shopify.intents?.invoke) {
      shopify.toast.show(
        "Shopify's discount pages aren't available here. Reload Appsy and try again.",
        { isError: true },
      );
      return;
    }
    const activity = id
      ? await shopify.intents.invoke("edit:shopify/Discount", { value: id })
      : await shopify.intents.invoke("create:shopify/Discount");
    const response = await activity.complete;
    if (response?.code === "ok") revalidate();
  };

  const allow = async () => {
    try {
      const response = await shopify.scopes.request(["read_discounts"]);
      if (response.result === "granted-all") revalidate();
    } catch (error) {
      console.error("Discounts permission:", error);
      shopify.toast.show(
        "Shopify couldn't ask for this permission. Please try again.",
        { isError: true },
      );
    }
  };

  return (
    <s-stack gap="base">
      <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end">
        <s-text-field label="Your code start" value={prefix} readOnly />
        <s-button onClick={() => void copy()}>Copy</s-button>
      </s-grid>
      <s-ordered-list>
        <s-list-item>
          Press Create discount, and choose the kind of discount in Shopify.
        </s-list-item>
        <s-list-item>
          Start its code with {prefix}, for example {example}. Set its value,
          dates and limits as usual.
        </s-list-item>
        <s-list-item>
          Share it without the start: shoppers type POTLI in your app, and it
          doesn&apos;t work on your website. In an Offer section, enter POTLI,
          and your app adds {prefix} itself.
        </s-list-item>
      </s-ordered-list>
      <s-paragraph color="subdued">
        App-only codes keep your app&apos;s offers off your website, but they
        aren&apos;t locked: anyone who learns a whole code, like {example}, can
        use it on your website too.
      </s-paragraph>
      <s-stack direction="inline" gap="small">
        <s-button variant="primary" onClick={() => void openDiscount()}>
          Create discount
        </s-button>
        <s-button
          variant="tertiary"
          commandFor="new-code-start"
          command="--show"
          loading={renewing || undefined}
        >
          Get a new code start
        </s-button>
      </s-stack>
      {result && result.issues.length > 0 && (
        <s-banner tone="critical" heading="That didn't change">
          <s-unordered-list>
            {result.issues.map((issue, index) => (
              <s-list-item key={index}>{issue.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-heading>Your app codes</s-heading>
      {!access ? (
        <s-banner tone="info" heading="Allow Appsy to read your discounts">
          <s-paragraph>
            To list your app codes here, Appsy needs Shopify&apos;s permission
            to read your discounts. Your codes work in your app either way.
          </s-paragraph>
          <s-button slot="secondary-actions" onClick={() => void allow()}>
            Allow
          </s-button>
        </s-banner>
      ) : !list?.available ? (
        <s-banner tone="warning">
          Appsy couldn&apos;t read your discounts just now. Reload the page to
          try again.
        </s-banner>
      ) : list.codes.length === 0 ? (
        <s-paragraph color="subdued">
          No discount codes start with {prefix} yet.
        </s-paragraph>
      ) : (
        <s-stack gap="small">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Shoppers type</s-table-header>
              <s-table-header listSlot="secondary">Discount</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Used
              </s-table-header>
              <s-table-header>Edit</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {list.codes.map((code) => (
                <s-table-row key={code.id}>
                  <s-table-cell>
                    {code.codes > 1
                      ? `${code.shown} (and ${code.codes - 1} more)`
                      : code.shown}
                  </s-table-cell>
                  <s-table-cell>{code.summary ?? code.code}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS[code.status].tone}>
                      {STATUS[code.status].label}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{code.used}</s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="tertiary"
                      accessibilityLabel={`Edit ${code.shown} in Shopify`}
                      onClick={() => void openDiscount(code.id)}
                    >
                      Edit
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {list.capped && (
            <s-paragraph color="subdued">
              Appsy looked through your 200 most recently changed discount
              codes.
            </s-paragraph>
          )}
        </s-stack>
      )}

      <s-modal id="new-code-start" heading="Get a new code start?">
        <s-paragraph>
          Codes that start with {prefix} stop working in your app. To keep one,
          change its code in Shopify so it starts with the new code start.
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="new-code-start"
          command="--hide"
          onClick={() =>
            fetcher.submit(
              { setting: "newCodeStart", value: "on" },
              { method: "POST" },
            )
          }
        >
          Get a new code start
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor="new-code-start"
          command="--hide"
        >
          Cancel
        </s-button>
      </s-modal>
    </s-stack>
  );
}

const GA_NOTICES: Partial<Record<string, string>> = {
  uploadGoogleServices:
    "Firebase file saved. Your Android app's next build includes it.",
  removeGoogleServices:
    "Firebase file removed. Your Android app stops sending to Google Analytics with its next build.",
  uploadGoogleServicesIos:
    "Firebase file saved. Your iPhone app's next build includes it.",
  removeGoogleServicesIos:
    "Firebase file removed. Your iPhone app stops sending to Google Analytics with its next build.",
};

// The merchant's GA4, through a Firebase project made from it (doc 03, section J2), with a
// Firebase file per platform. Google: adding an app stream to a GA4 property creates a
// Firebase project linked to the property (https://support.google.com/analytics/answer/9304153).
// Each file is checked against the App ID (models/google-analytics.server.ts) and reaches
// phones with the app's next build for its platform.
function GoogleAnalytics({
  appId,
  connection,
  iosConnection,
}: {
  appId: string | null;
  connection: FirebaseConnection | null;
  iosConnection: FirebaseIosConnection | null;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const result = busy ? undefined : fetcher.data;

  useEffect(() => {
    if (!result || result.issues.length > 0) return;
    const notice = GA_NOTICES[result.setting];
    if (notice) shopify.toast.show(notice);
  }, [result, shopify]);

  if (!appId) return <AppIdFirst />;

  const submit = (setting: FileChange, value = "") =>
    fetcher.submit({ setting, value }, { method: "POST" });

  return (
    <s-stack gap="base">
      {result && result.issues.length > 0 && (
        <s-banner tone="critical" heading="That file wasn't saved">
          {result.issues.map((issue) => (
            <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
          ))}
        </s-banner>
      )}

      <s-heading>Android</s-heading>
      {connection ? (
        <s-stack gap="small">
          <s-paragraph>
            Connected to the Firebase project{" "}
            <s-text type="strong">{connection.projectId}</s-text>, app{" "}
            <s-text type="strong">{connection.packageName}</s-text>. Your
            Android app&apos;s next build includes it.
          </s-paragraph>
          {connection.packageName !== appId && (
            <s-banner tone="warning">
              This file is for {connection.packageName}, but your App ID is now{" "}
              {appId}. Upload the file for {appId}.
            </s-banner>
          )}
          <s-stack direction="inline">
            <s-button
              variant="tertiary"
              tone="critical"
              disabled={busy || undefined}
              onClick={() => submit("removeGoogleServices")}
            >
              Remove file
            </s-button>
          </s-stack>
        </s-stack>
      ) : (
        <s-ordered-list>
          <s-list-item>
            In Google Analytics, open Admin, then Data streams, and add a
            stream: choose Android app.
          </s-list-item>
          <s-list-item>
            Enter {appId} as the package name and your app&apos;s name, then
            register the app. Google creates a Firebase project for your
            property and links it.
          </s-list-item>
          <s-list-item>
            Download google-services.json when Google offers it. You can also
            find it later in Firebase, under Project settings, in Your apps.
          </s-list-item>
          <s-list-item>Upload it below.</s-list-item>
        </s-ordered-list>
      )}
      <GoogleServicesDrop
        replace={connection !== null}
        disabled={busy}
        onText={(text) => submit("uploadGoogleServices", text)}
      />

      <s-heading>iPhone</s-heading>
      {iosConnection ? (
        <s-stack gap="small">
          <s-paragraph>
            Connected to the Firebase project{" "}
            <s-text type="strong">{iosConnection.projectId}</s-text>, app{" "}
            <s-text type="strong">{iosConnection.bundleId}</s-text>. Your iPhone
            app&apos;s next build includes it.
          </s-paragraph>
          {iosConnection.bundleId !== appId && (
            <s-banner tone="warning">
              This file is for {iosConnection.bundleId}, but your App ID is now{" "}
              {appId}. Upload the file for {appId}.
            </s-banner>
          )}
          {connection && connection.projectId !== iosConnection.projectId && (
            <s-banner tone="warning">
              Your Android and iPhone files are for different Firebase projects
              ({connection.projectId} and {iosConnection.projectId}), so their
              events may go to different Google Analytics properties. Add both
              apps as streams of the same property.
            </s-banner>
          )}
          <s-stack direction="inline">
            <s-button
              variant="tertiary"
              tone="critical"
              disabled={busy || undefined}
              onClick={() => submit("removeGoogleServicesIos")}
            >
              Remove file
            </s-button>
          </s-stack>
        </s-stack>
      ) : (
        <s-ordered-list>
          <s-list-item>
            In Google Analytics, open Admin, then Data streams, and add a
            stream: choose iOS app.
          </s-list-item>
          <s-list-item>
            Enter {appId} as the bundle ID and your app&apos;s name, then
            register the app. If Google asks for an App Store ID before your app
            is in the App Store, Firebase lets you add it later, under Project
            settings.
          </s-list-item>
          <s-list-item>
            Download GoogleService-Info.plist when Google offers it. You can
            also find it later in Firebase, under Project settings, in Your
            apps.
          </s-list-item>
          <s-list-item>Upload it below.</s-list-item>
        </s-ordered-list>
      )}
      <GoogleServicesPlistDrop
        replace={iosConnection !== null}
        disabled={busy}
        onText={(text) => submit("uploadGoogleServicesIos", text)}
      />

      <s-paragraph color="subdued">
        Your app sends Google Analytics its product views, collection views, add
        to bag, wishlist saves, checkouts started and orders, as Google&apos;s
        recommended shopping events, only after the shopper allows usage data.
        It doesn&apos;t send search words, the phone&apos;s advertising ID or,
        on iPhones, Apple&apos;s vendor ID. Your privacy text, Google Play
        answers and App Store answers on the Publishing page now mention Google
        Analytics. If you turn on Google signals or link Google Ads in Google
        Analytics, Google says your answers may change.
      </s-paragraph>
    </s-stack>
  );
}

function AppIdFirst() {
  return (
    <s-banner tone="info" heading="Choose your App ID first">
      <s-paragraph>
        Your apps use your App ID, as the Android package name and the iPhone
        bundle ID. Choose it under Store accounts on the{" "}
        <s-link href="/app/publishing">Publishing page</s-link>, then come back
        here.
      </s-paragraph>
    </s-banner>
  );
}

// A file the merchant downloaded from Google or Apple, read in the browser and sent as text.
function TextFileDrop({
  label,
  accept,
  maxBytes,
  tooLarge,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  maxBytes: number;
  tooLarge: string;
  disabled: boolean;
  onFile: (text: string, name: string) => void;
}) {
  const [problem, setProblem] = useState<string>();
  return (
    <s-drop-zone
      label={label}
      accept={accept}
      error={problem}
      disabled={disabled || undefined}
      onChange={(event) => {
        const file = event.currentTarget.files[0];
        setProblem(undefined);
        if (!file) return;
        if (file.size > maxBytes) {
          setProblem(tooLarge);
          return;
        }
        void file.text().then((text) => onFile(text, file.name));
      }}
    />
  );
}

function GoogleServicesDrop({
  replace,
  disabled,
  onText,
}: {
  replace: boolean;
  disabled: boolean;
  onText: (text: string) => void;
}) {
  return (
    <TextFileDrop
      label={replace ? "Replace google-services.json" : "google-services.json"}
      accept=".json,application/json"
      maxBytes={100_000}
      tooLarge="This file is too large to be a google-services.json."
      disabled={disabled}
      onFile={onText}
    />
  );
}

function GoogleServicesPlistDrop({
  replace,
  disabled,
  onText,
}: {
  replace: boolean;
  disabled: boolean;
  onText: (text: string) => void;
}) {
  return (
    <TextFileDrop
      label={
        replace
          ? "Replace GoogleService-Info.plist"
          : "GoogleService-Info.plist"
      }
      accept=".plist"
      maxBytes={100_000}
      tooLarge="This file is too large to be a GoogleService-Info.plist."
      disabled={disabled}
      onFile={onText}
    />
  );
}

const FILE_NOTICES: Partial<Record<string, string>> = {
  uploadGoogleServices:
    "Firebase file saved. Your Android app's next build includes it.",
  removeGoogleServices: "Firebase file removed",
  uploadPushKey: "Firebase key connected",
  removePushKey: "Firebase key removed",
  uploadApnsKey: "APNs key connected",
  removeApnsKey: "APNs key removed",
};

// Push notifications (app-config push.ts; doc 03, section I): for Android phones, the app's
// Firebase project (the google-services.json Google Analytics also uses) and the Firebase key
// Appsy sends with; for iPhones, the APNs key from the merchant's Apple Developer account
// (models/push.server.ts and apns.server.ts, keys kept in the vault). Automatic
// notifications, like the bag reminder, are on the Push notifications page.
function PushNotifications({
  appId,
  firebase,
  keys,
  appleTeamId,
  googleAnalytics,
}: {
  appId: string | null;
  firebase: FirebaseConnection | null;
  keys: PushKeys;
  appleTeamId: string | null;
  googleAnalytics: boolean;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const result = busy ? undefined : fetcher.data;
  const pushKey = keys.firebase;

  useEffect(() => {
    if (!result || result.issues.length > 0) return;
    const notice = FILE_NOTICES[result.setting];
    if (notice) shopify.toast.show(notice);
  }, [result, shopify]);

  if (!appId) return <AppIdFirst />;

  const submit = (
    setting: FileChange,
    value = "",
    fields: Record<string, string> = {},
  ) => fetcher.submit({ setting, value, ...fields }, { method: "POST" });

  return (
    <s-stack gap="base">
      {result && result.issues.length > 0 && (
        <s-banner tone="critical" heading="That wasn't saved">
          {result.issues.map((issue) => (
            <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
          ))}
        </s-banner>
      )}

      <s-heading>Android: your app&apos;s Firebase project</s-heading>
      {firebase ? (
        <s-paragraph>
          Your app uses the Firebase project{" "}
          <s-text type="strong">{firebase.projectId}</s-text>
          {googleAnalytics
            ? ", from the google-services.json under Google Analytics."
            : "."}
        </s-paragraph>
      ) : (
        <s-ordered-list>
          <s-list-item>
            Open the Firebase console at console.firebase.google.com. Create a
            project, or open the one your Google Analytics already uses.
          </s-list-item>
          <s-list-item>
            Add an Android app with {appId} as its package name.
          </s-list-item>
          <s-list-item>
            Download google-services.json and upload it below. Your app&apos;s
            next build includes it.
          </s-list-item>
        </s-ordered-list>
      )}
      {firebase && firebase.packageName !== appId && (
        <s-banner tone="warning">
          This file is for {firebase.packageName}, but your App ID is now{" "}
          {appId}. Upload the file for {appId}.
        </s-banner>
      )}
      {!googleAnalytics && (
        <s-stack gap="small">
          <GoogleServicesDrop
            replace={firebase !== null}
            disabled={busy}
            onText={(text) => submit("uploadGoogleServices", text)}
          />
          {firebase && (
            <s-stack direction="inline">
              <s-button
                variant="tertiary"
                tone="critical"
                disabled={busy || undefined}
                onClick={() => submit("removeGoogleServices")}
              >
                Remove file
              </s-button>
            </s-stack>
          )}
        </s-stack>
      )}

      <s-heading>Android: your Firebase key</s-heading>
      {pushKey ? (
        <s-stack gap="small">
          <s-paragraph>
            Connected. Appsy sends your notifications to Android phones as{" "}
            <s-text type="strong">{pushKey.clientEmail}</s-text>.
          </s-paragraph>
          {firebase && pushKey.projectId !== firebase.projectId && (
            <s-banner tone="warning">
              This key is for {pushKey.projectId}, but your app&apos;s Firebase
              project is now {firebase.projectId}. Upload a key from{" "}
              {firebase.projectId}.
            </s-banner>
          )}
          <s-stack direction="inline">
            <s-button
              variant="tertiary"
              tone="critical"
              disabled={busy || undefined}
              onClick={() => submit("removePushKey")}
            >
              Remove key
            </s-button>
          </s-stack>
        </s-stack>
      ) : (
        <s-ordered-list>
          <s-list-item>
            In Firebase, open Project settings, then Service accounts.
          </s-list-item>
          <s-list-item>
            Choose Generate new private key, then Generate key. Keep the file
            safe: anyone who has it can send notifications to your shoppers.
          </s-list-item>
          <s-list-item>
            Upload it below. Appsy checks it with Google and keeps it encrypted.
          </s-list-item>
        </s-ordered-list>
      )}
      <TextFileDrop
        label={pushKey ? "Replace Firebase key" : "Firebase key (.json)"}
        accept=".json,application/json"
        maxBytes={20_000}
        tooLarge="This file is too large to be a Firebase key."
        disabled={busy || !firebase}
        onFile={(text) => submit("uploadPushKey", text)}
      />

      <s-divider />
      <s-heading>iPhone: your APNs key</s-heading>
      <ApnsKey
        // A new key empties the form.
        key={keys.apple?.checkedAt ?? "none"}
        appId={appId}
        appleTeamId={appleTeamId}
        status={keys.apple}
        busy={busy}
        onConnect={(keyId, text) => submit("uploadApnsKey", text, { keyId })}
        onRemove={() => submit("removeApnsKey")}
      />

      {(keys.firebase || keys.apple) && (
        <s-stack direction="inline">
          <s-button variant="primary" href="/app/push">
            Send a notification
          </s-button>
        </s-stack>
      )}

      <s-divider />
      <s-paragraph>
        Automatic notifications, like the abandoned bag reminder, are on the{" "}
        <s-link href="/app/push">Push notifications page</s-link>, where you
        switch each on or off and change its words and picture.
      </s-paragraph>

      <s-paragraph color="subdued">
        Your app asks shoppers the first time they add something to their bag,
        and they can turn notifications off under Privacy choices. Notifications
        reach phones once they have your app&apos;s next build, and pictures
        show on Android phones only. Your privacy text, Google Play answers and
        App Store answers on the Publishing page now mention notifications.
      </s-paragraph>
    </s-stack>
  );
}

// The APNs key Appsy sends iPhone notifications with, made in the merchant's Apple Developer
// account (Apple: https://developer.apple.com/help/account/keys/create-a-private-key/ and
// https://developer.apple.com/help/account/keys/get-a-key-identifier/), and checked with
// Apple before it's kept (models/push.server.ts). It belongs to the Apple team of their App
// Store account.
function ApnsKey({
  appId,
  appleTeamId,
  status,
  busy,
  onConnect,
  onRemove,
}: {
  appId: string;
  appleTeamId: string | null;
  status: AppleKeyStatus | null;
  busy: boolean;
  onConnect: (keyId: string, text: string) => void;
  onRemove: () => void;
}) {
  const [keyId, setKeyId] = useState("");
  const [file, setFile] = useState<{ text: string; name: string } | null>(null);

  if (!appleTeamId) {
    return (
      <s-banner tone="info" heading="Connect your App Store account first">
        <s-paragraph>
          The APNs key comes from the same Apple Developer account. Connect it
          under Store accounts on the{" "}
          <s-link href="/app/publishing">Publishing page</s-link>, then come
          back here.
        </s-paragraph>
      </s-banner>
    );
  }

  return (
    <s-stack gap="base">
      {status ? (
        <s-stack gap="small">
          <s-paragraph>
            Connected. Appsy sends your notifications to iPhones with the key{" "}
            <s-text type="strong">{status.keyId}</s-text>, from your Apple team{" "}
            {status.teamId}.
          </s-paragraph>
          {status.teamId !== appleTeamId && (
            <s-banner tone="warning">
              This key is from the Apple team {status.teamId}, but your App
              Store account is now team {appleTeamId}. Upload a key from{" "}
              {appleTeamId}.
            </s-banner>
          )}
          <s-stack direction="inline">
            <s-button
              variant="tertiary"
              tone="critical"
              disabled={busy || undefined}
              onClick={onRemove}
            >
              Remove key
            </s-button>
          </s-stack>
        </s-stack>
      ) : (
        <s-ordered-list>
          <s-list-item>
            In your Apple Developer account, open Certificates, Identifiers
            &amp; Profiles, choose Keys in the sidebar, then the add button (+).
            This needs the Account Holder or Admin role.
          </s-list-item>
          <s-list-item>
            Name the key and select Apple Push Notification service. In its
            configuration, choose an environment that includes production, and
            Team Scoped as the key type (or Topic Specific, with {appId} as its
            topic).
          </s-list-item>
          <s-list-item>
            Review the key, confirm it, then download it. Apple doesn&apos;t
            keep a copy, so you can download the .p8 file only once. Keep it
            safe: it lets whoever has it send notifications as your app.
          </s-list-item>
          <s-list-item>
            Enter the key&apos;s Key ID, shown below its name under Keys, and
            upload the .p8 file below. Appsy checks it with Apple and keeps it
            encrypted.
          </s-list-item>
        </s-ordered-list>
      )}
      <s-text-field
        label="Key ID"
        placeholder="2X9R4HXF34"
        maxLength={10}
        value={keyId}
        disabled={busy || undefined}
        onInput={(event) => setKeyId(event.currentTarget.value)}
      />
      <TextFileDrop
        label={status ? "Replace APNs key (.p8)" : "APNs key (.p8)"}
        accept=".p8"
        maxBytes={20_000}
        tooLarge="This file is too large to be an APNs key (.p8)."
        disabled={busy}
        onFile={(text, name) => setFile({ text, name })}
      />
      {file && <s-text color="subdued">Chosen: {file.name}</s-text>}
      <s-stack direction="inline">
        <s-button
          disabled={busy || keyId.trim() === "" || !file || undefined}
          onClick={() => file && onConnect(keyId, file.text)}
        >
          {status ? "Replace key" : "Connect key"}
        </s-button>
      </s-stack>
    </s-stack>
  );
}

const MATCH_LABELS: Record<SizeChartMatch, string> = {
  product: "A product",
  collection: "Products in a collection",
  type: "Products of a type",
  tag: "Products with a tag",
  vendor: "Products from a vendor",
};

const VALUE_LABELS: Record<"type" | "tag" | "vendor", string> = {
  type: "Product type",
  tag: "Tag",
  vendor: "Vendor",
};

// Which products a rule covers, in words.
function ruleProducts(rule: SizeChartRule, titles: Record<string, string>) {
  switch (rule.match) {
    case "product":
      return `Product: ${titles[rule.value] ?? "one no longer in your store"}`;
    case "collection":
      return `Collection: ${titles[rule.value] ?? "one no longer in your store"}`;
    case "type":
      return `Product type: ${rule.value}`;
    case "tag":
      return `Tag: ${rule.value}`;
    case "vendor":
      return `Vendor: ${rule.value}`;
  }
}

const chartNumber = (id: string) => id.split("/").pop();

// The store's size charts, which products show which, and deleting one. Charts are made on
// their own page (app.size-charts.$id.tsx); these choices apply at once, like the switches.
function SizeCharts({
  charts,
  choices,
  titles,
}: {
  charts: SizeChartSummary[] | null;
  choices: SizeChartSettings;
  titles: Record<string, string>;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const result = busy ? undefined : fetcher.data;
  const [deleting, setDeleting] = useState<SizeChartSummary | null>(null);
  const [match, setMatch] = useState<SizeChartMatch>("collection");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [chart, setChart] = useState("");

  useEffect(() => {
    if (!result || result.issues.length > 0) return;
    shopify.toast.show(
      result.setting === "deleteSizeChart"
        ? "Size chart deleted"
        : result.live
          ? "Saved. Your app uses it now."
          : "Saved. Your app gets it when you first publish its design.",
    );
  }, [result, shopify]);

  // Before the update that adds size charts reaches the store, Shopify doesn't know them.
  if (!charts) {
    return (
      <s-banner tone="warning" heading="Appsy couldn't read your size charts">
        <s-paragraph>
          Reload Appsy. If Shopify asks you to approve an update, approve it:
          that update adds size charts to your store.
        </s-paragraph>
      </s-banner>
    );
  }

  const names = Object.fromEntries(
    charts.map((entry) => [entry.id, entry.name]),
  );
  const save = (next: SizeChartSettings) =>
    fetcher.submit(
      { setting: "sizeChartSettings", value: JSON.stringify(next) },
      { method: "POST" },
    );
  const picksResource = match === "product" || match === "collection";
  const ruleValue = picksResource ? (picked?.id ?? "") : text.trim();
  const canAdd = !busy && ruleValue !== "" && chart !== "";

  const pick = async () => {
    const selected =
      match === "product"
        ? await shopify.resourcePicker({
            type: "product",
            action: "select",
            filter: {
              variants: false,
              draft: false,
              archived: false,
              hidden: false,
            },
          })
        : await shopify.resourcePicker({
            type: "collection",
            action: "select",
          });
    const item = selected?.[0];
    if (item) setPicked({ id: item.id, title: item.title });
  };

  const addRule = () => {
    if (!canAdd) return;
    save({
      ...choices,
      rules: [...choices.rules, { match, value: ruleValue, chart }],
    });
    setText("");
    setPicked(null);
  };

  return (
    <s-stack gap="base">
      {result && result.issues.length > 0 && (
        <s-banner tone="critical" heading="That didn't change">
          <s-unordered-list>
            {result.issues.map((issue, index) => (
              <s-list-item key={index}>{issue.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-heading>Your charts</s-heading>
      {charts.length === 0 ? (
        <s-paragraph color="subdued">
          No size charts yet. Create one, then choose which products show it.
        </s-paragraph>
      ) : (
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Name</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {charts.map((entry) => (
              <s-table-row key={entry.id}>
                <s-table-cell>
                  <s-link href={`/app/size-charts/${chartNumber(entry.id)}`}>
                    {entry.name}
                  </s-link>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button
                      variant="tertiary"
                      href={`/app/size-charts/${chartNumber(entry.id)}`}
                    >
                      Edit
                    </s-button>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      commandFor="delete-size-chart"
                      command="--show"
                      onClick={() => setDeleting(entry)}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      )}
      <s-stack direction="inline">
        <s-button variant="primary" href="/app/size-charts/new">
          Create size chart
        </s-button>
      </s-stack>

      {charts.length > 0 && (
        <>
          <s-divider />
          <s-heading>Which products show which chart</s-heading>
          <s-paragraph color="subdued">
            Each product shows one chart: the first rule that fits it (a product
            rule first, then a collection, product type, tag and vendor), else
            the default chart. To give one product its own chart, add a rule for
            that product.
          </s-paragraph>
          <s-select
            label="Default chart"
            details="For every product no rule covers. Choose None to show charts only through rules."
            value={choices.defaultChart ?? ""}
            disabled={busy || undefined}
            onChange={(event) => {
              const next = event.currentTarget.value;
              save(
                next
                  ? { ...choices, defaultChart: next }
                  : { rules: choices.rules },
              );
            }}
          >
            <s-option value="">None</s-option>
            {charts.map((entry) => (
              <s-option key={entry.id} value={entry.id}>
                {entry.name}
              </s-option>
            ))}
          </s-select>

          {choices.rules.length > 0 && (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Products</s-table-header>
                <s-table-header listSlot="secondary">Chart</s-table-header>
                <s-table-header>Remove</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {choices.rules.map((rule, index) => (
                  <s-table-row key={`${rule.match}-${rule.value}-${index}`}>
                    <s-table-cell>{ruleProducts(rule, titles)}</s-table-cell>
                    <s-table-cell>
                      {names[rule.chart] ?? "A deleted chart"}
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Remove the rule for ${ruleProducts(rule, titles)}`}
                        disabled={busy || undefined}
                        onClick={() =>
                          save({
                            ...choices,
                            rules: choices.rules.filter(
                              (_, place) => place !== index,
                            ),
                          })
                        }
                      />
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}

          <s-grid
            gridTemplateColumns="1fr 1fr 1fr auto"
            gap="small"
            alignItems="end"
          >
            <s-select
              label="Add a rule for"
              value={match}
              onChange={(event) => {
                setMatch(event.currentTarget.value as SizeChartMatch);
                setPicked(null);
                setText("");
              }}
            >
              {SIZE_CHART_MATCHES.map((kind) => (
                <s-option key={kind} value={kind}>
                  {MATCH_LABELS[kind]}
                </s-option>
              ))}
            </s-select>
            {picksResource ? (
              <s-button onClick={() => void pick()}>
                {picked
                  ? picked.title
                  : match === "product"
                    ? "Choose a product"
                    : "Choose a collection"}
              </s-button>
            ) : (
              <s-text-field
                label={VALUE_LABELS[match as "type" | "tag" | "vendor"]}
                details="As it's written in Shopify."
                value={text}
                maxLength={255}
                onInput={(event) => setText(event.currentTarget.value)}
              />
            )}
            <s-select
              label="Chart"
              value={chart}
              onChange={(event) => setChart(event.currentTarget.value)}
            >
              <s-option value="">Choose a chart</s-option>
              {charts.map((entry) => (
                <s-option key={entry.id} value={entry.id}>
                  {entry.name}
                </s-option>
              ))}
            </s-select>
            <s-button disabled={!canAdd || undefined} onClick={addRule}>
              Add rule
            </s-button>
          </s-grid>
        </>
      )}

      <s-paragraph color="subdued">
        In your app, the link shows under the product&apos;s options; you can
        hide it in the editor&apos;s Options block.
      </s-paragraph>

      <s-modal id="delete-size-chart" heading="Delete this size chart?">
        <s-paragraph>
          {deleting
            ? `"${deleting.name}" is deleted from your store, and its rules are removed. Products that used it show the next chart that fits, or none.`
            : ""}
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="delete-size-chart"
          command="--hide"
          onClick={() => {
            if (deleting) {
              fetcher.submit(
                { setting: "deleteSizeChart", value: deleting.id },
                { method: "POST" },
              );
            }
          }}
        >
          Delete
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor="delete-size-chart"
          command="--hide"
        >
          Cancel
        </s-button>
      </s-modal>
    </s-stack>
  );
}

// One switch. It applies at once, as Polaris says switches should; if Shopify or Appsy
// refused, it goes back and says why.
function SettingSwitch({
  setting,
  label,
  details,
  checked,
  children,
}: {
  setting: Extract<
    SettingName,
    | "appCodes"
    | "sizeCharts"
    | "googleAnalytics"
    | "pushNotifications"
    | "currencyConversion"
    | "wishlist"
  >;
  label: string;
  details: string;
  checked: boolean;
  children?: ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [on, setOn] = useState(checked);
  const busy = fetcher.state !== "idle";
  const result = busy ? undefined : fetcher.data;

  useEffect(() => {
    if (!result) return;
    if (result.issues.length > 0) {
      setOn(!result.on);
      return;
    }
    shopify.toast.show(
      result.live
        ? `${label} is ${result.on ? "on" : "off"} in your app`
        : "Saved. Your app gets it when you first publish its design.",
    );
  }, [result, shopify, label]);

  const toggle = (next: boolean) => {
    setOn(next);
    fetcher.submit({ setting, value: next ? "on" : "off" }, { method: "POST" });
  };

  return (
    <s-stack gap="base">
      <s-switch
        label={label}
        details={details}
        checked={on || undefined}
        disabled={busy || undefined}
        onChange={(event) => toggle(event.currentTarget.checked)}
      />
      {result && result.issues.length > 0 && (
        <s-banner tone="critical" heading="That didn't change">
          <s-unordered-list>
            {result.issues.map((issue, index) => (
              <s-list-item key={index}>{issue.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}
      {children}
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
