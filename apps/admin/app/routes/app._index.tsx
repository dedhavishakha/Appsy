import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import {
  connectChannel,
  disconnectChannel,
  loadChannel,
} from "../models/channel.server";

// Appsy's home: the account and publishing sections that Shopify requires of sales
// channel apps (App Store requirements 5.7.x; docs/01, Phase 1).

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const channel = await loadChannel(admin, shop);

  return { channel };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const intent = (await request.formData()).get("intent");

  if (intent === "connect") {
    return {
      intent,
      errors: await connectChannel(admin, shop.id, shop.appProject.id),
    };
  }
  if (intent === "disconnect") {
    const channel = await loadChannel(admin, shop);
    return {
      intent,
      errors: channel ? await disconnectChannel(admin, shop.id, channel.id) : [],
    };
  }
  return { intent, errors: [`Unknown action "${intent}"`] };
};

export default function Home() {
  const { channel } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const pendingIntent =
    fetcher.state === "idle" ? null : fetcher.formData?.get("intent");
  const errors = fetcher.state === "idle" ? (fetcher.data?.errors ?? []) : [];
  const connected = channel !== null;
  const count = channel?.productsCount;
  const countText = count
    ? `${count.count.toLocaleString("en")}${count.precision === "AT_LEAST" ? "+" : ""}`
    : "0";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || fetcher.data.errors.length > 0) {
      return;
    }
    shopify.toast.show(
      fetcher.data.intent === "connect" ? "Appsy connected" : "Appsy disconnected",
    );
  }, [fetcher.state, fetcher.data, shopify]);

  const submit = (intent: "connect" | "disconnect") =>
    fetcher.submit({ intent }, { method: "POST" });

  return (
    <s-page heading="Appsy">
      {errors.length > 0 && (
        <s-banner tone="critical" heading="Appsy couldn't finish that">
          {errors.map((message) => (
            <s-paragraph key={message}>{message}</s-paragraph>
          ))}
        </s-banner>
      )}

      {/* Appsy approves every store straight away, so the banner shows the connection (5.7.8, 5.7.15). */}
      {connected ? (
        <s-banner tone="success" heading="Your store is connected to Appsy">
          <s-paragraph>
            Products you make available to the Appsy sales channel can appear in
            your mobile app.
          </s-paragraph>
        </s-banner>
      ) : (
        <s-banner tone="info" heading="Connect your store to get started">
          <s-paragraph>
            Connect Appsy below so your products can appear in your mobile app.
          </s-paragraph>
        </s-banner>
      )}

      {/* Account section: always visible and labelled with the channel name (5.7.13). */}
      <s-section>
        <s-stack gap="base">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid-item>
              <s-stack gap="small">
                <s-heading>Appsy</s-heading>
                <s-text color="subdued">
                  {connected
                    ? `Connected. Orders placed in your app show as "${channel.accountName ?? "Mobile app"}".`
                    : "No account connected"}
                </s-text>
              </s-stack>
            </s-grid-item>
            <s-grid-item>
              {connected ? (
                <s-button
                  variant="secondary"
                  tone="critical"
                  commandFor="disconnect-modal"
                  command="--show"
                  loading={pendingIntent === "disconnect"}
                >
                  Disconnect
                </s-button>
              ) : (
                <s-button
                  variant="primary"
                  loading={pendingIntent === "connect"}
                  onClick={() => submit("connect")}
                >
                  Connect
                </s-button>
              )}
            </s-grid-item>
          </s-grid>

          {/* Terms open in a new window (5.7.7); commission (5.7.6). */}
          {!connected && (
            <s-paragraph>
              By clicking Connect, you agree to Appsy&apos;s{" "}
              <s-link href="/terms" target="_blank">
                terms and conditions
              </s-link>
              . Appsy doesn&apos;t take a commission on sales made through your
              app.
            </s-paragraph>
          )}

          {/* Eligibility, shown in the account section (5.7.17). */}
          <s-paragraph color="subdued">
            Any Shopify store can connect. To publish your app, you&apos;ll need your
            own Apple Developer and Google Play developer accounts.
          </s-paragraph>
        </s-stack>

        <s-modal id="disconnect-modal" heading="Disconnect Appsy?">
          <s-paragraph>
            Your products will stop appearing in your mobile app. Orders already
            placed through the app stay in Shopify.
          </s-paragraph>
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            commandFor="disconnect-modal"
            command="--hide"
            onClick={() => submit("disconnect")}
          >
            Disconnect
          </s-button>
          <s-button slot="secondary-actions" commandFor="disconnect-modal" command="--hide">
            Cancel
          </s-button>
        </s-modal>
      </s-section>

      {/* Publishing section: a card in the annotated layout, with the published-product count (5.7.4, 5.7.9). */}
      {connected && (
        <s-query-container>
          <s-grid
            gridTemplateColumns="@container (inline-size > 640px) 1fr 2fr, 1fr"
            gap="base"
          >
            <s-grid-item>
              <s-stack gap="small">
                <s-heading>Product publishing</s-heading>
                <s-paragraph color="subdued">
                  Products you make available to the Appsy sales channel appear in
                  your app.
                </s-paragraph>
              </s-stack>
            </s-grid-item>
            <s-grid-item>
              <s-section>
                <s-stack gap="base">
                  <s-paragraph>
                    <s-text type="strong">{countText}</s-text>{" "}
                    {count?.count === 1 ? "product is" : "products are"} available
                    in your app.
                  </s-paragraph>
                  <s-link href="shopify://admin/products">Manage products</s-link>
                </s-stack>
              </s-section>
            </s-grid-item>
          </s-grid>
        </s-query-container>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
