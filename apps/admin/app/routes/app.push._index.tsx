import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import { pushOn } from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { loadDesign } from "../models/design.server";
import {
  cancelCampaign,
  loadCampaigns,
  loadPushKey,
  type CampaignRow,
  type CampaignStatus,
} from "../models/push.server";

// Push notifications: the campaigns the merchant sent or scheduled, how many phones each
// reached, and how many shoppers opened the app from it (models/push.server.ts). New ones
// are written on app.push.new.tsx; the switch, the Firebase key and the bag reminder are on
// the Functionality page.

// While a campaign is going out, the page looks again this often.
const REFRESH_MS = 10_000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const [design, key, list] = await Promise.all([
    loadDesign(appProjectId),
    loadPushKey(appProjectId),
    loadCampaigns(appProjectId),
  ]);
  return { on: pushOn(design), ready: key !== null, ...list };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const id = z.uuid().safeParse(form.get("cancel"));
  return {
    canceled: id.success
      ? await cancelCampaign(shop.appProject.id, id.data)
      : false,
  };
};

const STATUS: Record<
  CampaignStatus,
  {
    label: string;
    tone: "info" | "success" | "warning" | "critical" | "neutral";
  }
> = {
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "warning" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Didn't send", tone: "critical" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export default function PushNotificationsPage() {
  const { on, ready, campaigns, phones } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const sending = campaigns.some((campaign) => campaign.status === "sending");

  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(() => void revalidate(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [sending, revalidate]);

  return (
    <s-page heading="Push notifications">
      {on && ready && (
        <s-button slot="primary-action" variant="primary" href="/app/push/new">
          New notification
        </s-button>
      )}

      {!on ? (
        <s-banner tone="info" heading="Push notifications are off">
          <s-paragraph>
            Turn them on under Push notifications on the{" "}
            <s-link href="/app/functionality">Functionality page</s-link>, and
            connect your Firebase project there.
          </s-paragraph>
        </s-banner>
      ) : (
        !ready && (
          <s-banner tone="info" heading="Connect your Firebase key first">
            <s-paragraph>
              Appsy sends notifications through your own Firebase project. Add
              its key under Push notifications on the{" "}
              <s-link href="/app/functionality">Functionality page</s-link>.
            </s-paragraph>
          </s-banner>
        )
      )}

      <s-section heading="Your notifications">
        <s-stack gap="base">
          <s-paragraph color="subdued">
            {phones === 1
              ? "1 phone can get your notifications."
              : `${phones.toLocaleString("en")} phones can get your notifications.`}{" "}
            Shoppers allow them in your app, the first time they add something
            to their bag.
          </s-paragraph>
          {campaigns.length === 0 ? (
            <s-paragraph color="subdued">No notifications yet.</s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Notification</s-table-header>
                <s-table-header listSlot="inline">Status</s-table-header>
                <s-table-header listSlot="secondary">When</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">
                  Reached
                </s-table-header>
                <s-table-header listSlot="labeled" format="numeric">
                  Opened
                </s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {campaigns.map((campaign) => (
                  <CampaignLine key={campaign.id} campaign={campaign} />
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

function CampaignLine({ campaign }: { campaign: CampaignRow }) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const status = STATUS[campaign.status];

  useEffect(() => {
    if (busy || !fetcher.data) return;
    shopify.toast.show(
      fetcher.data.canceled
        ? "Notification canceled"
        : "It can't be canceled: it has already started.",
      { isError: !fetcher.data.canceled },
    );
  }, [busy, fetcher.data, shopify]);

  return (
    <s-table-row>
      <s-table-cell>
        <s-stack gap="small-200">
          <s-text type="strong">{campaign.title}</s-text>
          <s-text color="subdued">{campaign.body}</s-text>
          {campaign.countries.length > 0 && (
            <s-text color="subdued">
              Shoppers in {campaign.countries.join(", ")}
            </s-text>
          )}
          {campaign.error && <s-text tone="critical">{campaign.error}</s-text>}
        </s-stack>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={status.tone}>{status.label}</s-badge>
      </s-table-cell>
      <s-table-cell>
        <When iso={campaign.finishedAt ?? campaign.sendAt} />
      </s-table-cell>
      <s-table-cell>
        {campaign.status === "scheduled" || campaign.status === "canceled"
          ? "–"
          : campaign.status === "sending"
            ? `${campaign.sent + campaign.failed} of ${campaign.targeted}`
            : campaign.sent}
      </s-table-cell>
      <s-table-cell>{campaign.sent > 0 ? campaign.opened : "–"}</s-table-cell>
      <s-table-cell>
        {campaign.status === "scheduled" && (
          <s-button
            variant="tertiary"
            tone="critical"
            disabled={busy || undefined}
            onClick={() =>
              fetcher.submit({ cancel: campaign.id }, { method: "POST" })
            }
          >
            Cancel
          </s-button>
        )}
      </s-table-cell>
    </s-table-row>
  );
}

// A time in the merchant's own time zone (the browser's), as they scheduled it. The server
// doesn't know that zone, so its first draw says UTC.
function When({ iso }: { iso: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  const date = new Date(iso);
  return local
    ? date.toLocaleString("en", options)
    : `${date.toLocaleString("en", { ...options, timeZone: "UTC" })} UTC`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
