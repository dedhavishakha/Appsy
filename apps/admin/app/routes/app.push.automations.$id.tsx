import { useEffect, useMemo, useState } from "react";
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
  AUTOMATION_KINDS,
  AUTOMATION_RULES,
  AUTOMATION_TEMPLATES,
  automationWhen,
  fillAutomationText,
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  pushAutomationInput,
  pushOn,
  type AutomationImageMode,
  type AutomationKind,
  type ImageValue,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { loadDesign } from "../models/design.server";
import {
  deleteAutomation,
  loadAutomation,
  saveAutomation,
  sendAutomationTest,
  syncLegacyBagReminder,
} from "../models/push-automations.server";
import { loadPushKeys, pushPictureUrl } from "../models/push.server";
import { SaveBar } from "../components/save-bar";
import { ImagePicker } from "../components/setting-control";
import { usePickImage } from "../components/use-pick-image";

// One automatic notification (models/push-automations.server.ts), Appsy's template or the
// merchant's own ("new" makes one): when it sends, its words with the product's and app's
// names, its picture, and a test to the merchant's own phone. Saved with Shopify's save bar or
// the page's own Save button.

const SAVE_BAR = "automation-save-bar";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const id = params.id === "new" ? null : z.uuid().safeParse(params.id);
  if (id && !id.success) throw new Response("Not found", { status: 404 });
  const [automation, design, keys, granted] = await Promise.all([
    id ? loadAutomation(appProjectId, id.data) : null,
    loadDesign(appProjectId),
    loadPushKeys(appProjectId),
    scopes
      .query()
      .then((result) => result.granted)
      .catch(() => null),
  ]);
  if (id && !automation) throw new Response("Not found", { status: 404 });
  return {
    automation,
    ready: pushOn(design) && (keys.firebase !== null || keys.apple !== null),
    appName: shop.appProject.appName,
    filesAccess:
      granted === null ||
      ["read_files", "write_files"].some((name) => granted.includes(name)),
  };
};

type ActionResult = {
  intent: "save" | "test" | "delete";
  errors: string[];
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const form = await request.formData();
  const intent = form.get("intent");
  const id = params.id === "new" ? null : z.uuid().safeParse(params.id);
  if (id && !id.success) throw new Response("Not found", { status: 404 });
  const automationId = id ? id.data : null;

  if (intent === "delete") {
    const deleted = automationId
      ? await deleteAutomation(appProjectId, automationId)
      : false;
    return {
      intent,
      errors: deleted
        ? []
        : [
            "Appsy's own automatic notifications can't be deleted: switch them off instead.",
          ],
    };
  }

  const kind = intent === "test" ? "test" : "save";
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(form.get("automation")));
  } catch {
    raw = null;
  }
  const parsed = pushAutomationInput.safeParse(raw);
  if (!parsed.success) {
    return {
      intent: kind,
      errors: [...new Set(parsed.error.issues.map((issue) => issue.message))],
    };
  }
  let imageUrl: string | null = null;
  if (parsed.data.imageMode === "file") {
    try {
      imageUrl = await pushPictureUrl(admin, parsed.data.image);
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("Picture for an automatic notification:", error);
    }
    if (!imageUrl) {
      return {
        intent: kind,
        errors: [
          "Shopify didn't give Appsy this picture. Choose it again, or another one.",
        ],
      };
    }
  }

  if (kind === "test") {
    const code = z.string().max(20).safeParse(form.get("code"));
    return {
      intent: kind,
      errors: await sendAutomationTest(
        appProjectId,
        code.success ? code.data : "",
        parsed.data,
        imageUrl,
      ),
    };
  }
  const row = await saveAutomation(
    appProjectId,
    automationId,
    parsed.data,
    imageUrl,
  );
  if (!row) {
    return {
      intent: kind,
      errors: ["This automatic notification no longer exists."],
    };
  }
  await syncLegacyBagReminder(admin, shop, row, sessionToken?.sub ?? null);
  return { intent: kind, errors: [] };
};

type Draft = {
  kind: AutomationKind;
  name: string;
  enabled: boolean;
  delay: number;
  title: string;
  body: string;
  imageMode: AutomationImageMode;
  image: ImageValue | null;
};

// A new one starts from Appsy's template of its kind, switched off until it's saved on.
function fromTemplate(kind: AutomationKind): Draft {
  const template = AUTOMATION_TEMPLATES.find((entry) => entry.kind === kind)!;
  return {
    kind,
    name: `My ${AUTOMATION_RULES[kind].label.toLowerCase()}`,
    enabled: false,
    delay: template.delay,
    title: template.title,
    body: template.body,
    imageMode: template.imageMode,
    image: null,
  };
}

const IMAGE_CHOICES: { value: AutomationImageMode; label: string }[] = [
  { value: "product", label: "The product's own picture" },
  { value: "file", label: "A picture from your Shopify Files" },
  { value: "none", label: "No picture" },
];

export default function AutomationPage() {
  const { automation, ready, appName, filesAccess } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const pickImage = usePickImage();
  const fetcher = useFetcher<typeof action>();
  const initial: Draft = automation
    ? {
        kind: automation.kind,
        name: automation.name,
        enabled: automation.enabled,
        delay: automation.delay,
        title: automation.title,
        body: automation.body,
        imageMode: automation.imageMode,
        image: automation.image,
      }
    : fromTemplate("abandoned_bag");
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  // Changes after Discard, so every field draws the saved value again.
  const [formKey, setFormKey] = useState(0);
  const [code, setCode] = useState("");
  const busy = fetcher.state !== "idle";
  const intent = busy ? fetcher.formData?.get("intent") : fetcher.data?.intent;
  const errors = busy ? [] : (fetcher.data?.errors ?? []);
  // A new one can be saved as it starts, so its save bar shows from the start.
  const dirty = !automation || JSON.stringify(draft) !== JSON.stringify(saved);
  const rules = AUTOMATION_RULES[draft.kind];
  const isTemplate = Boolean(automation?.template);
  const imageModes = useMemo(() => [draft.imageMode], [draft.imageMode]);

  // Back to the Push notifications page, with the save bar out of the way first.
  const leave = () => {
    shopify.saveBar
      .hide(SAVE_BAR)
      .catch(() => {})
      .finally(() => navigate("/app/push"));
  };

  useEffect(() => {
    if (busy || !fetcher.data) return;
    if (fetcher.data.errors.length > 0) {
      shopify.toast.show(fetcher.data.errors[0] ?? "That wasn't saved", {
        isError: true,
      });
      return;
    }
    if (fetcher.data.intent === "test") {
      shopify.toast.show("Test sent. It reaches your phone within a minute.");
      return;
    }
    if (fetcher.data.intent === "delete") {
      shopify.toast.show("Automatic notification deleted");
      leave();
      return;
    }
    setSaved(draft);
    shopify.toast.show("Saved");
    if (!automation) leave();
    // Only once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, fetcher.data]);

  const update = (change: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const submit = (kind: "save" | "test") =>
    fetcher.submit(
      { intent: kind, automation: JSON.stringify(draft), code },
      { method: "POST" },
    );
  // Discarding a new one drops it; otherwise the saved values come back.
  const discard = () => {
    if (!automation) {
      leave();
      return;
    }
    setDraft(saved);
    setFormKey((key) => key + 1);
  };
  // How the notification reads, with a stand-in for the product's name.
  const names = { product: "Black cotton T-shirt", store: appName };

  return (
    <s-page heading={automation?.name ?? "New automatic notification"}>
      <s-link slot="breadcrumb-actions" href="/app/push">
        Push notifications
      </s-link>
      <SaveBar
        id={SAVE_BAR}
        dirty={dirty}
        busy={busy}
        onSave={() => submit("save")}
        onDiscard={discard}
      />

      {!ready && (
        <s-banner tone="warning" heading="Push notifications aren't ready">
          <s-paragraph>
            Turn them on and connect your Firebase key or APNs key under Push
            notifications on the{" "}
            <s-link href="/app/functionality">Functionality page</s-link>.
          </s-paragraph>
        </s-banner>
      )}
      {automation?.problem && (
        <s-banner tone="critical" heading="Sending stopped">
          <s-paragraph>{automation.problem}</s-paragraph>
        </s-banner>
      )}
      {errors.length > 0 && (
        <s-banner
          tone="critical"
          heading={
            intent === "test" ? "The test wasn't sent" : "That wasn't saved"
          }
        >
          {errors.map((message) => (
            <s-paragraph key={message}>{message}</s-paragraph>
          ))}
        </s-banner>
      )}

      <s-section heading="When it sends">
        <s-stack gap="base" key={`when-${formKey}`}>
          <s-switch
            label="Send this automatically"
            details={automationWhen(draft.kind, draft.delay)}
            checked={draft.enabled || undefined}
            onChange={(event) =>
              update({ enabled: event.currentTarget.checked })
            }
          />
          <s-text-field
            label="Name"
            details="Only you see it."
            value={draft.name}
            maxLength={60}
            onInput={(event) => update({ name: event.currentTarget.value })}
          />
          {!isTemplate && !automation && (
            <s-select
              label="Sends when"
              value={draft.kind}
              onChange={(event) =>
                setDraft({
                  ...fromTemplate(event.currentTarget.value as AutomationKind),
                  name: draft.name,
                })
              }
            >
              {AUTOMATION_KINDS.map((kind) => (
                <s-option key={kind} value={kind}>
                  {AUTOMATION_RULES[kind].label}
                </s-option>
              ))}
            </s-select>
          )}
          <s-number-field
            label={
              draft.kind === "abandoned_bag"
                ? "Hours after the bag last changed"
                : "Days after a product is saved to the wishlist"
            }
            min={rules.min}
            max={rules.max}
            step={1}
            value={String(draft.delay)}
            onChange={(event) => {
              const value = Math.round(Number(event.currentTarget.value));
              if (Number.isFinite(value)) {
                update({
                  delay: Math.min(Math.max(value, rules.min), rules.max),
                });
              }
            }}
          />
          <s-paragraph color="subdued">
            Only bags and wishlist products that change after it&apos;s switched
            on count.{" "}
            {draft.kind === "abandoned_bag"
              ? "A tap opens the shopper's bag."
              : "A tap opens the product. Products no longer for sale are left out."}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Message">
        <s-stack gap="base" key={`message-${formKey}`}>
          <s-text-field
            label="Title"
            value={draft.title}
            maxLength={PUSH_TITLE_MAX}
            details="Write {product} where the product's name goes, and {store} for your app's name."
            onInput={(event) => update({ title: event.currentTarget.value })}
          />
          <s-text-area
            label="Message"
            value={draft.body}
            rows={3}
            maxLength={PUSH_BODY_MAX}
            onInput={(event) => update({ body: event.currentTarget.value })}
          />
          <s-choice-list
            label="Picture"
            name="imageMode"
            values={imageModes}
            onChange={(event) =>
              update({
                imageMode: event.currentTarget.values[0] as AutomationImageMode,
              })
            }
          >
            {IMAGE_CHOICES.map((choice) => (
              <s-choice key={choice.value} value={choice.value}>
                {choice.label}
              </s-choice>
            ))}
          </s-choice-list>
          {draft.imageMode === "file" && (
            <ImagePicker
              label="Picture from your Shopify Files"
              value={draft.image}
              tools={{ pickImage, filesAccess }}
              onChange={(image) => update({ image })}
            />
          )}
          <s-text color="subdued">
            Android shows the picture when the shopper expands the notification;
            iPhones show the notification without it.
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
            <s-text type="strong">
              {fillAutomationText(draft.title || "Title", names)}
            </s-text>
            <s-text>
              {fillAutomationText(draft.body || "Message", names)}
            </s-text>
            {draft.imageMode === "file" && draft.image && (
              <s-image
                src={draft.image.url}
                alt={draft.image.alt}
                aspectRatio="2/1"
                objectFit="cover"
                borderRadius="base"
              />
            )}
            {draft.imageMode === "product" && (
              <s-text color="subdued">With the product&apos;s picture</s-text>
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-stack direction="inline" gap="small" alignItems="center">
        <s-button
          variant="primary"
          disabled={!dirty || busy || undefined}
          loading={(busy && intent === "save") || undefined}
          onClick={() => submit("save")}
        >
          {automation ? "Save" : "Create automatic notification"}
        </s-button>
        {dirty && (
          <s-button
            variant="tertiary"
            disabled={busy || undefined}
            onClick={discard}
          >
            {automation ? "Discard changes" : "Cancel"}
          </s-button>
        )}
      </s-stack>

      {automation && (
        <s-section heading="Results">
          <s-paragraph>
            Reached {automation.sent.toLocaleString("en")}{" "}
            {automation.sent === 1 ? "phone" : "phones"}, opened{" "}
            {automation.opened.toLocaleString("en")}{" "}
            {automation.opened === 1 ? "time" : "times"}.
          </s-paragraph>
        </s-section>
      )}

      <s-section heading="Send a test">
        <s-stack gap="base">
          <s-paragraph color="subdued">
            See it on your own phone: in your app, allow notifications, then
            open Privacy choices in the menu for your phone&apos;s test code.
            The test uses your phone&apos;s own bag or wishlist when it has one,
            or your store&apos;s first product.
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
              disabled={!ready || busy || code.trim() === "" || undefined}
              loading={(busy && intent === "test") || undefined}
              onClick={() => submit("test")}
            >
              Send test
            </s-button>
          </s-grid>
        </s-stack>
      </s-section>

      {automation && !isTemplate && (
        <s-section>
          <s-stack direction="inline">
            <s-button
              tone="critical"
              variant="tertiary"
              commandFor="delete-automation"
              command="--show"
            >
              Delete automatic notification
            </s-button>
          </s-stack>
          <s-modal
            id="delete-automation"
            heading="Delete this automatic notification?"
          >
            <s-paragraph>
              It stops sending, and its results go with it.
            </s-paragraph>
            <s-button
              slot="primary-action"
              variant="primary"
              tone="critical"
              commandFor="delete-automation"
              command="--hide"
              onClick={() =>
                fetcher.submit({ intent: "delete" }, { method: "POST" })
              }
            >
              Delete
            </s-button>
            <s-button
              slot="secondary-actions"
              commandFor="delete-automation"
              command="--hide"
            >
              Cancel
            </s-button>
          </s-modal>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
