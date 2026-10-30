import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  pushCampaignInput,
  pushOn,
  type ImageValue,
  type LinkValue,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { loadDesign, loadPages } from "../models/design.server";
import { storefrontQuery } from "../models/storefront.server";
import {
  createCampaign,
  loadPushKey,
  pushPictureUrl,
  sendTest,
} from "../models/push.server";
import {
  DateTimeField,
  ImagePicker,
  LinkPicker,
} from "../components/setting-control";
import { usePickImage } from "../components/use-pick-image";

// A new push notification (models/push.server.ts): its words, picture and link, who gets it
// and when, with a test to the merchant's own phone first. Appsy's server sends it straight
// to Google with the store's Firebase key.

// The countries the store sells to (Shopify Markets), read the way phones read them.
const COUNTRIES_QUERY = `#graphql
  query AppsyPushCountries {
    localization {
      availableCountries { isoCode name }
    }
  }`;

type Country = { isoCode: string; name: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const [design, key, pages, markets, granted] = await Promise.all([
    loadDesign(appProjectId),
    loadPushKey(appProjectId),
    loadPages(shop).catch((error) => {
      console.error(`Pages for ${session.shop}:`, error);
      return [];
    }),
    shop.storefrontToken
      ? storefrontQuery<{ localization: { availableCountries: Country[] } }>(
          shop.shopDomain,
          shop.storefrontToken,
          COUNTRIES_QUERY,
        ).catch((error) => {
          console.error(`Countries for ${session.shop}:`, error);
          return null;
        })
      : null,
    scopes
      .query()
      .then((result) => result.granted)
      .catch(() => null),
  ]);
  const countries = [...(markets?.localization.availableCountries ?? [])].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  return {
    ready: pushOn(design) && key !== null,
    appName: shop.appProject.appName,
    pages,
    countries,
    filesAccess:
      granted === null ||
      ["read_files", "write_files"].some((name) => granted.includes(name)),
  };
};

type ActionResult = { intent: "send" | "test"; errors: string[] };

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const intent = form.get("intent") === "test" ? "test" : "send";
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(form.get("campaign")));
  } catch {
    raw = null;
  }
  const parsed = pushCampaignInput.safeParse(raw);
  if (!parsed.success) {
    return {
      intent,
      errors: [...new Set(parsed.error.issues.map((issue) => issue.message))],
    };
  }
  let imageUrl: string | null;
  try {
    imageUrl = await pushPictureUrl(admin, parsed.data.image);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Picture for a push notification:", error);
    imageUrl = null;
  }
  if (parsed.data.image && !imageUrl) {
    return {
      intent,
      errors: [
        "Shopify didn't give Appsy this picture. Choose it again, or another one.",
      ],
    };
  }
  if (intent === "test") {
    const code = z.string().max(20).safeParse(form.get("code"));
    return {
      intent,
      errors: await sendTest(
        shop.appProject.id,
        code.success ? code.data : "",
        parsed.data,
        imageUrl,
      ),
    };
  }
  return {
    intent,
    errors: await createCampaign(
      shop.appProject.id,
      parsed.data,
      imageUrl,
      sessionToken?.sub ?? null,
    ),
  };
};

type Draft = {
  title: string;
  body: string;
  image: ImageValue | null;
  link: LinkValue | null;
  everyone: boolean;
  countries: string[];
  later: boolean;
  sendAt: string | null;
};

const EMPTY: Draft = {
  title: "",
  body: "",
  image: null,
  link: null,
  everyone: true,
  countries: [],
  later: false,
  sendAt: null,
};

export default function NewPushNotification() {
  const { ready, appName, pages, countries, filesAccess } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const pickImage = usePickImage();
  const fetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [code, setCode] = useState("");
  const busy = fetcher.state !== "idle";
  const intent = busy ? fetcher.formData?.get("intent") : fetcher.data?.intent;
  const errors = busy ? [] : (fetcher.data?.errors ?? []);

  useEffect(() => {
    if (busy || !fetcher.data || fetcher.data.errors.length > 0) return;
    if (fetcher.data.intent === "test") {
      shopify.toast.show("Test sent. It reaches your phone within a minute.");
      return;
    }
    shopify.toast.show(draft.later ? "Notification scheduled" : "Sending now");
    navigate("/app/push");
    // Only once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, fetcher.data]);

  const update = (change: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...change }));

  const campaign = () =>
    JSON.stringify({
      title: draft.title,
      body: draft.body,
      image: draft.image,
      link: draft.link,
      countries: draft.everyone ? [] : draft.countries,
      sendAt: draft.later ? draft.sendAt : null,
    });
  const submit = (kind: "send" | "test") =>
    fetcher.submit(
      { intent: kind, campaign: campaign(), code },
      { method: "POST" },
    );

  const pickResource = async (
    type: "product" | "collection",
    current?: string,
  ) => {
    const selectionIds = current ? [{ id: current }] : [];
    const picked =
      type === "product"
        ? await shopify.resourcePicker({
            type: "product",
            action: "select",
            selectionIds,
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
            selectionIds,
          });
    const item = picked?.[0];
    return item
      ? { id: item.id, handle: item.handle, title: item.title }
      : null;
  };

  const canSend =
    ready &&
    !busy &&
    draft.title.trim() !== "" &&
    draft.body.trim() !== "" &&
    (draft.everyone || draft.countries.length > 0) &&
    (!draft.later || draft.sendAt !== null);

  return (
    <s-page heading="New notification">
      <s-link slot="breadcrumb-actions" href="/app/push">
        Push notifications
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!canSend || undefined}
        loading={(busy && intent === "send") || undefined}
        onClick={() => submit("send")}
      >
        {draft.later ? "Schedule" : "Send now"}
      </s-button>

      {!ready && (
        <s-banner tone="warning" heading="Push notifications aren't ready">
          <s-paragraph>
            Turn them on and connect your Firebase key under Push notifications
            on the <s-link href="/app/functionality">Functionality page</s-link>
            .
          </s-paragraph>
        </s-banner>
      )}

      {errors.length > 0 && (
        <s-banner
          tone="critical"
          heading={
            intent === "test"
              ? "The test wasn't sent"
              : "The notification wasn't sent"
          }
        >
          {errors.map((message) => (
            <s-paragraph key={message}>{message}</s-paragraph>
          ))}
        </s-banner>
      )}

      <s-section heading="Message">
        <s-stack gap="base">
          <s-text-field
            label="Title"
            value={draft.title}
            maxLength={PUSH_TITLE_MAX}
            details="Short and clear, like Diwali sale: 20% off"
            onInput={(event) => update({ title: event.currentTarget.value })}
          />
          <s-text-area
            label="Message"
            value={draft.body}
            rows={3}
            maxLength={PUSH_BODY_MAX}
            onInput={(event) => update({ body: event.currentTarget.value })}
          />
          <ImagePicker
            label="Picture"
            value={draft.image}
            tools={{ pickImage, filesAccess }}
            onChange={(image) => update({ image })}
          />
          <s-text color="subdued">
            Optional. Android shows it when the shopper expands the
            notification.
          </s-text>
          <LinkPicker
            label="When tapped, open"
            value={draft.link}
            tools={{ pages, pickResource }}
            onChange={(link) => update({ link })}
          />
          <s-text color="subdued">
            With no link, your app opens on its home page.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Preview">
        <s-box
          padding="base"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack gap="small-200">
            <s-text color="subdued">{appName}</s-text>
            <s-text type="strong">{draft.title || "Title"}</s-text>
            <s-text>{draft.body || "Message"}</s-text>
            {draft.image && (
              <s-image
                src={draft.image.url}
                alt={draft.image.alt}
                aspectRatio="2/1"
                objectFit="cover"
                borderRadius="base"
              />
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Who gets it">
        <s-stack gap="base">
          <s-choice-list
            label="Send to"
            values={[draft.everyone ? "everyone" : "countries"]}
            onChange={(event) =>
              update({
                everyone: event.currentTarget.values[0] !== "countries",
              })
            }
          >
            <s-choice value="everyone">
              Everyone who allowed notifications
            </s-choice>
            <s-choice value="countries" disabled={countries.length === 0}>
              Shoppers in some countries
            </s-choice>
          </s-choice-list>
          {!draft.everyone && (
            <s-choice-list
              label="Countries"
              details="The country each shopper chose in your app."
              multiple
              values={draft.countries}
              onChange={(event) =>
                update({ countries: [...event.currentTarget.values] })
              }
            >
              {countries.map((country) => (
                <s-choice key={country.isoCode} value={country.isoCode}>
                  {country.name}
                </s-choice>
              ))}
            </s-choice-list>
          )}
        </s-stack>
      </s-section>

      <s-section heading="When">
        <s-stack gap="base">
          <s-choice-list
            label="Send"
            values={[draft.later ? "later" : "now"]}
            onChange={(event) =>
              update({ later: event.currentTarget.values[0] === "later" })
            }
          >
            <s-choice value="now">Now</s-choice>
            <s-choice value="later">At a set time</s-choice>
          </s-choice-list>
          {draft.later && (
            <DateTimeField
              label="Date"
              value={draft.sendAt}
              onChange={(sendAt) => update({ sendAt })}
            />
          )}
        </s-stack>
      </s-section>

      <s-section heading="Send a test">
        <s-stack gap="base">
          <s-paragraph color="subdued">
            See it on your own phone first: in your app, allow notifications,
            then open Privacy choices in the menu for your phone&apos;s test
            code.
          </s-paragraph>
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-text-field
              label="Test code"
              placeholder="3F9A-0C12"
              value={code}
              maxLength={20}
              onInput={(event) => setCode(event.currentTarget.value)}
            />
            <s-button
              disabled={
                !ready ||
                busy ||
                code.trim() === "" ||
                draft.title.trim() === "" ||
                draft.body.trim() === "" ||
                undefined
              }
              loading={(busy && intent === "test") || undefined}
              onClick={() => submit("test")}
            >
              Send test
            </s-button>
          </s-grid>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
