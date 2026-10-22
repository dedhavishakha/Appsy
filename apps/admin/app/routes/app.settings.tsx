import { useEffect, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  switchFeature,
  type AppDesign,
  type DesignIssue,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { applySetting, loadDesign } from "../models/design.server";
import { storefrontQuery } from "../models/storefront.server";

// Settings: app-wide switches that take effect in the merchant's app at once, apart from the
// design they edit and publish in the editor.

// Each switch on this page, as the change it makes to the design (see applySetting).
const SETTINGS = {
  currencyConversion: (design: AppDesign, on: boolean): AppDesign => ({
    ...design,
    markets: { ...design.markets, displayCurrencyConversion: on },
  }),
  wishlist: (design: AppDesign, on: boolean) =>
    switchFeature(design, "wishlist", on),
};

type SettingName = keyof typeof SETTINGS;

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
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const design = await loadDesign(shop.appProject.id);
  // The store's Shopify Markets, read the way phones read them (Appsy's Storefront token).
  const markets = shop.storefrontToken
    ? await storefrontQuery<MarketsData>(
        shop.shopDomain,
        shop.storefrontToken,
        MARKETS_QUERY,
      ).catch((error) => {
        console.error(`Markets for ${session.shop}:`, error);
        return null;
      })
    : null;
  return {
    currencyConversion: design.markets.displayCurrencyConversion,
    wishlist: design.features.wishlist?.enabled === true,
    countries: markets?.localization.availableCountries ?? [],
    shopCurrency: markets?.shop.paymentSettings.currencyCode ?? null,
  };
};

type ActionResult = { issues: DesignIssue[]; live: boolean; on: boolean };

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const setting = String(form.get("setting"));
  const on = form.get("value") === "on";
  if (!Object.hasOwn(SETTINGS, setting)) {
    return {
      issues: [{ path: [], message: `Unknown setting "${setting}"` }],
      live: false,
      on,
    };
  }
  const change = SETTINGS[setting as SettingName];
  const result = await applySetting(
    admin,
    shop,
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_APP_URL ?? "",
    (design) => change(design, on),
    sessionToken?.sub ?? null,
  );
  return { issues: result.issues, live: result.live, on };
};

export default function Settings() {
  const { currencyConversion, wishlist, countries, shopCurrency } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
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

      {/* Always reachable here as well as on Home, opening in a new window (5.7.7); the
          commission line repeats Home's (5.7.6). */}
      <s-section heading="Terms and privacy">
        <s-stack gap="small">
          <s-paragraph>
            Appsy doesn&apos;t take a commission on sales made through your app.
          </s-paragraph>
          <s-link href="/terms" target="_blank">
            Terms and conditions
          </s-link>
          <s-link href="/privacy" target="_blank">
            Privacy policy
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
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
  setting: SettingName;
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
