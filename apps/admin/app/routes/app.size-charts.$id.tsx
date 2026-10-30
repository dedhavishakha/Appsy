import { useEffect, useRef, useState } from "react";
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
  shopifyGid,
  sizeChartTable,
  type ImageValue,
  type SizeChartTable,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { loadPages } from "../models/design.server";
import { loadSizeChart, saveSizeChart } from "../models/size-charts.server";
import { ImagePicker } from "../components/setting-control";
import {
  SizeChartTableEditor,
  STARTING_TABLE,
} from "../components/size-chart-table";
import { usePickImage } from "../components/use-pick-image";

// One size chart, from the Functionality page: its name, table, picture, "How to measure"
// note and size guide page. Saved to the store's Shopify (models/size-charts.server.ts)
// with Shopify's save bar or the page's own Save button.

const SAVE_BAR_ID = "size-chart-save-bar";
const NOTE_MAX = 1000;
const NAME_MAX = 60;

const chartInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the chart a name, such as T-shirts.")
    .max(NAME_MAX),
  table: sizeChartTable,
  image: shopifyGid("MediaImage").nullable(),
  note: z.string().max(NOTE_MAX),
  page: shopifyGid("Page").nullable(),
});

// "new", or the number at the end of the chart's id.
function chartIdFrom(param: string | undefined): string | null | undefined {
  if (param === "new") return null;
  return param && /^\d+$/.test(param)
    ? `gid://shopify/Metaobject/${param}`
    : undefined;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const id = chartIdFrom(params.id);
  if (id === undefined) throw new Response("Not found", { status: 404 });
  const [chart, pages, granted] = await Promise.all([
    id ? loadSizeChart(admin, id) : null,
    loadPages(shop).catch((error) => {
      console.error(`Pages for ${session.shop}:`, error);
      return [];
    }),
    scopes
      .query()
      .then((result) => result.granted)
      .catch(() => null),
  ]);
  if (id && !chart) throw new Response("Not found", { status: 404 });
  const filesAccess =
    granted === null ||
    ["read_files", "write_files"].some((name) => granted.includes(name));
  return { chart, pages, filesAccess };
};

type ActionResult = { errors: string[]; id: string | null };

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const id = chartIdFrom(params.id);
  if (id === undefined)
    return { errors: ["This chart doesn't exist."], id: null };
  const form = await request.formData();
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(form.get("chart")));
  } catch {
    raw = null;
  }
  const parsed = chartInput.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => issue.message),
      id: null,
    };
  }
  try {
    const result = await saveSizeChart(admin, id, parsed.data);
    return "errors" in result
      ? { errors: result.errors, id: null }
      : { errors: [], id: result.id };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Saving a size chart:", error);
    return {
      errors: [
        "Shopify didn't save the chart. If Appsy was just updated, reload it and approve the update if Shopify asks.",
      ],
      id: null,
    };
  }
};

type Draft = {
  name: string;
  table: SizeChartTable;
  image: ImageValue | null;
  note: string;
  page: string | null;
};

export default function SizeChartEditor() {
  const { chart, pages, filesAccess } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const pickImage = usePickImage();
  const fetcher = useFetcher<typeof action>();
  const initial: Draft = {
    name: chart?.name ?? "",
    table: chart?.table ?? STARTING_TABLE,
    image: chart?.image ?? null,
    note: chart?.note ?? "",
    page: chart?.page ?? null,
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const pendingJson = useRef<string | null>(null);

  const json = JSON.stringify(draft);
  const dirty = json !== savedJson;
  const busy = fetcher.state !== "idle";
  const errors = busy ? [] : (fetcher.data?.errors ?? []);

  // Shopify's save bar shows while the chart differs from the saved one, and goes with
  // the page (Save Bar API, programmatic).
  useEffect(() => {
    void (dirty
      ? shopify.saveBar.show(SAVE_BAR_ID)
      : shopify.saveBar.hide(SAVE_BAR_ID));
  }, [dirty, shopify]);
  useEffect(() => () => void shopify.saveBar.hide(SAVE_BAR_ID), [shopify]);

  useEffect(() => {
    if (busy || !fetcher.data || pendingJson.current === null) return;
    const { id } = fetcher.data;
    if (fetcher.data.errors.length === 0 && id) {
      setSavedJson(pendingJson.current);
      shopify.toast.show("Size chart saved");
      // A new chart now has an address of its own, so the next save updates it.
      if (!chart) {
        void shopify.saveBar.hide(SAVE_BAR_ID);
        navigate(`/app/size-charts/${id.split("/").pop()}`, { replace: true });
      }
    }
    pendingJson.current = null;
  }, [busy, fetcher.data, shopify, chart, navigate]);

  const save = () => {
    pendingJson.current = json;
    fetcher.submit(
      {
        chart: JSON.stringify({
          name: draft.name,
          table: draft.table,
          image: draft.image?.id ?? null,
          note: draft.note,
          page: draft.page,
        }),
      },
      { method: "POST" },
    );
  };

  const discard = () => setDraft(JSON.parse(savedJson) as Draft);
  const update = (change: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...change }));

  return (
    <s-page heading={chart ? chart.name || "Size chart" : "New size chart"}>
      <s-link slot="breadcrumb-actions" href="/app/functionality">
        Functionality
      </s-link>
      {/* Discard asks first. */}
      <ui-save-bar id={SAVE_BAR_ID} discardConfirmation>
        <button variant="primary" disabled={busy} onClick={save}>
          Save
        </button>
        <button disabled={busy} onClick={discard}>
          Discard
        </button>
      </ui-save-bar>

      {errors.length > 0 && (
        <s-banner tone="critical" heading="The chart wasn't saved">
          {errors.map((message) => (
            <s-paragraph key={message}>{message}</s-paragraph>
          ))}
        </s-banner>
      )}

      <s-section heading="Chart">
        <s-stack gap="base">
          <s-text-field
            label="Name"
            value={draft.name}
            maxLength={NAME_MAX}
            details="Shoppers see it at the top of the chart, and you choose charts by it."
            onInput={(event) => update({ name: event.currentTarget.value })}
          />
          <SizeChartTableEditor
            table={draft.table}
            onChange={(table) => update({ table })}
          />
        </s-stack>
      </s-section>

      <s-section heading="Picture and notes">
        <s-stack gap="base">
          <ImagePicker
            label="Picture"
            value={draft.image}
            tools={{ pickImage, filesAccess }}
            onChange={(image) => update({ image })}
          />
          <s-text color="subdued">
            Optional. Shown under the table, for example a drawing of where to
            measure, or a chart you already have as a picture.
          </s-text>
          <s-text-area
            label="How to measure"
            value={draft.note}
            rows={4}
            maxLength={NOTE_MAX}
            details="Optional. Shown under the table."
            onInput={(event) => update({ note: event.currentTarget.value })}
          />
          <s-select
            label="Size guide page"
            value={draft.page ?? ""}
            details="Optional. A page of your online store with more sizing help. Your app opens it in its browser."
            onChange={(event) =>
              update({ page: event.currentTarget.value || null })
            }
          >
            <s-option value="">None</s-option>
            {pages.map((page) => (
              <s-option key={page.id} value={page.id}>
                {page.title}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-stack direction="inline" gap="small" alignItems="center">
        <s-button
          variant="primary"
          disabled={!dirty || busy || undefined}
          loading={busy || undefined}
          onClick={save}
        >
          Save size chart
        </s-button>
        {dirty && !busy && (
          <s-text color="subdued">You have unsaved changes.</s-text>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
