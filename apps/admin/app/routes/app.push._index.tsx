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
  loadAutomations,
  setAutomationEnabled,
  syncLegacyBagReminder,
  type AutomationRow,
} from "../models/push-automations.server";
import {
  cancelCampaign,
  loadCampaigns,
  loadPushKeys,
  type CampaignRow,
  type CampaignStatus,
} from "../models/push.server";

// Push notifications: the automatic notifications (templates and the merchant's own, with a
// switch each; models/push-automations.server.ts, edited on app.push.automations.$id.tsx),
// and the campaigns the merchant sent or scheduled, how many phones each reached, and how
// many shoppers opened the app from it (models/push.server.ts). New campaigns are written on
// app.push.new.tsx; the switch and the keys (Firebase for Android phones, APNs for iPhones)
// are on the Functionality page.

// While a campaign is going out, the page looks again this often.
const REFRESH_MS = 10_000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const [design, keys, list, automations] = await Promise.all([
    loadDesign(appProjectId),
    loadPushKeys(appProjectId),
    loadCampaigns(appProjectId),
    loadAutomations(appProjectId),
  ]);
  return {
    on: pushOn(design),
    keys: { android: keys.firebase !== null, ios: keys.apple !== null },
    automations,
    ...list,
  };
};

// Cancelling a scheduled campaign ("cancel"), or switching an automatic notification on or
// off ("automation" and "enabled").
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const automation = z.uuid().safeParse(form.get("automation"));
  if (automation.success) {
    const row = await setAutomationEnabled(
      shop.appProject.id,
      automation.data,
      form.get("enabled") === "on",
    );
    if (row) {
      await syncLegacyBagReminder(admin, shop, row, sessionToken?.sub ?? null);
    }
    return { canceled: false, switched: row ? row.enabled : null };
  }
  const id = z.uuid().safeParse(form.get("cancel"));
  return {
    canceled: id.success
      ? await cancelCampaign(shop.appProject.id, id.data)
      : false,
    switched: undefined,
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

// "1 iPhone", "2 Android phones".
const count = (number: number, one: string) =>
  `${number.toLocaleString("en")} ${one}${number === 1 ? "" : "s"}`;

export default function PushNotificationsPage() {
  const { on, keys, automations, campaigns, phones } =
    useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const ready = keys.android || keys.ios;
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
            connect your keys there.
          </s-paragraph>
        </s-banner>
      ) : (
        !ready && (
          <s-banner tone="info" heading="Connect a key first">
            <s-paragraph>
              Appsy sends notifications with your own keys: your Firebase key
              for Android phones and your APNs key for iPhones. Add them under
              Push notifications on the{" "}
              <s-link href="/app/functionality">Functionality page</s-link>.
            </s-paragraph>
          </s-banner>
        )
      )}

      <s-section heading="Automatic notifications">
        <s-stack gap="base">
          <s-paragraph color="subdued">
            Sent by themselves when something happens in your app, with the
            product&apos;s name, and its picture on Android phones. A phone gets
            at most 2 a day, and none between 21:00 and 09:00 where it is. They
            reach phones with your app&apos;s latest build.
          </s-paragraph>
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Notification</s-table-header>
              <s-table-header listSlot="secondary">Sends</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Reached
              </s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Opened
              </s-table-header>
              <s-table-header listSlot="inline">On</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {automations.map((automation) => (
                <AutomationLine key={automation.id} automation={automation} />
              ))}
            </s-table-body>
          </s-table>
          <s-stack direction="inline">
            <s-button href="/app/push/automations/new">
              Create automatic notification
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Your notifications">
        <s-stack gap="base">
          <s-paragraph color="subdued">
            {count(phones.android, "Android phone")} and{" "}
            {count(phones.ios, "iPhone")} can get your notifications. Shoppers
            allow them in your app, the first time they add something to their
            bag.
            {ready && !keys.android && phones.android > 0
              ? " Android phones get them once you connect your Firebase key."
              : ""}
            {ready && !keys.ios && phones.ios > 0
              ? " iPhones get them once you connect your APNs key."
              : ""}
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

// One automatic notification: its name (a link to edit it), when it sends, its results and
// its switch, which applies at once, as Polaris says switches should.
function AutomationLine({ automation }: { automation: AutomationRow }) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const [on, setOn] = useState(automation.enabled);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (busy || !fetcher.data || fetcher.data.switched === undefined) return;
    if (fetcher.data.switched === null) {
      setOn(automation.enabled);
      shopify.toast.show("That automatic notification no longer exists.", {
        isError: true,
      });
      return;
    }
    shopify.toast.show(
      fetcher.data.switched
        ? `${automation.name} is on`
        : `${automation.name} is off`,
    );
    // Only once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, fetcher.data]);

  return (
    <s-table-row>
      <s-table-cell>
        <s-stack gap="small-200">
          <s-link href={`/app/push/automations/${automation.id}`}>
            {automation.name}
          </s-link>
          <s-text color="subdued">{automation.title}</s-text>
          {automation.problem && (
            <s-text tone="critical">{automation.problem}</s-text>
          )}
        </s-stack>
      </s-table-cell>
      <s-table-cell>{automation.when}</s-table-cell>
      <s-table-cell>{automation.sent}</s-table-cell>
      <s-table-cell>
        {automation.sent > 0 ? automation.opened : "–"}
      </s-table-cell>
      <s-table-cell>
        <s-switch
          label={`${automation.name} on`}
          labelAccessibilityVisibility="exclusive"
          checked={on || undefined}
          disabled={busy || undefined}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setOn(next);
            fetcher.submit(
              { automation: automation.id, enabled: next ? "on" : "off" },
              { method: "POST" },
            );
          }}
        />
      </s-table-cell>
    </s-table-row>
  );
}

function CampaignLine({ campaign }: { campaign: CampaignRow }) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const status = STATUS[campaign.status];

  useEffect(() => {
    if (busy || !fetcher.data || fetcher.data.switched !== undefined) return;
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
