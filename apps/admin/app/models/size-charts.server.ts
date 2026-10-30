import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  imageValue,
  readSizeChartTable,
  SIZE_CHART_TYPE,
  type ImageValue,
  type SizeChartTable,
} from "@appsy/app-config";

// Size charts on Appsy's Functionality page: Appsy-owned entries in the store's Shopify
// (metaobject type $app:size_chart, declared in shopify.app.toml). Apps read and write
// their own entries without access scopes (shopify.dev changelog, 2026-04). Which products
// use which chart is in the design (app-config size-charts.ts).

export type SizeChartSummary = { id: string; name: string };

export type SizeChart = SizeChartSummary & {
  table: SizeChartTable | null;
  image: ImageValue | null;
  note: string;
  // A page of the online store, by id.
  page: string | null;
};

export type SizeChartInput = {
  name: string;
  table: SizeChartTable;
  image: string | null;
  note: string;
  page: string | null;
};

const LIST_QUERY = `#graphql
  query AppsySizeCharts {
    metaobjects(type: "${SIZE_CHART_TYPE}", first: 100, sortKey: "display_name") {
      nodes {
        id
        name: field(key: "name") { value }
      }
    }
  }`;

const CHART_QUERY = `#graphql
  query AppsySizeChart($id: ID!) {
    metaobject(id: $id) {
      id
      name: field(key: "name") { value }
      table: field(key: "table") { jsonValue }
      note: field(key: "note") { value }
      page: field(key: "page") { value }
      image: field(key: "image") {
        reference {
          ... on MediaImage { id image { url width height altText } }
        }
      }
    }
  }`;

const CREATE_MUTATION = `#graphql
  mutation AppsySizeChartCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message code }
    }
  }`;

const UPDATE_MUTATION = `#graphql
  mutation AppsySizeChartUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message code }
    }
  }`;

const DELETE_MUTATION = `#graphql
  mutation AppsySizeChartDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message code }
    }
  }`;

const TITLES_QUERY = `#graphql
  query AppsyRuleTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on Product { title }
      ... on Collection { title }
    }
  }`;

type UserError = { field?: string[] | null; message: string };

type Answer<Data> = { data?: Data; errors?: unknown };

async function ask<Data>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Data> {
  const response = await admin.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as Answer<Data>;
  if (body.errors || !body.data) {
    throw new Error(JSON.stringify(body.errors ?? "No data"));
  }
  return body.data;
}

// The store's charts, by name. Null if Shopify refused: before Appsy's update that adds
// the size chart entries reaches the store, it doesn't know the type yet.
export async function listSizeCharts(
  admin: AdminApiContext,
): Promise<SizeChartSummary[] | null> {
  try {
    const data = await ask<{
      metaobjects: { nodes: { id: string; name: { value: string } | null }[] };
    }>(admin, LIST_QUERY);
    return data.metaobjects.nodes.map((node) => ({
      id: node.id,
      name: node.name?.value ?? "Size chart",
    }));
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Size charts:", error);
    return null;
  }
}

export async function loadSizeChart(
  admin: AdminApiContext,
  id: string,
): Promise<SizeChart | null> {
  const data = await ask<{
    metaobject: {
      id: string;
      name: { value: string } | null;
      table: { jsonValue: unknown } | null;
      note: { value: string } | null;
      page: { value: string } | null;
      image: {
        reference: {
          id: string;
          image: {
            url: string;
            width: number;
            height: number;
            altText: string | null;
          } | null;
        } | null;
      } | null;
    } | null;
  }>(admin, CHART_QUERY, { id });
  const chart = data.metaobject;
  if (!chart) return null;
  const file = chart.image?.reference;
  const image = imageValue.safeParse(
    file?.image
      ? {
          id: file.id,
          url: file.image.url,
          width: file.image.width,
          height: file.image.height,
          alt: file.image.altText ?? "",
        }
      : null,
  );
  return {
    id: chart.id,
    name: chart.name?.value ?? "",
    table: readSizeChartTable(chart.table?.jsonValue),
    image: image.success ? image.data : null,
    note: chart.note?.value ?? "",
    page: chart.page?.value || null,
  };
}

export type SaveResult = { id: string } | { errors: string[] };

// Creates a chart, or replaces one's values. `values` is a full replacement, so a field
// left out (no picture, note or page) is cleared (metaobjectUpdate, API 2026-07).
export async function saveSizeChart(
  admin: AdminApiContext,
  id: string | null,
  chart: SizeChartInput,
): Promise<SaveResult> {
  const values: Record<string, unknown> = {
    name: chart.name,
    table: chart.table,
    ...(chart.image ? { image: chart.image } : {}),
    ...(chart.note.trim() ? { note: chart.note.trim() } : {}),
    ...(chart.page ? { page: chart.page } : {}),
  };
  if (id) {
    const data = await ask<{
      metaobjectUpdate: {
        metaobject: { id: string } | null;
        userErrors: UserError[];
      };
    }>(admin, UPDATE_MUTATION, { id, metaobject: { values } });
    const { metaobject, userErrors } = data.metaobjectUpdate;
    return metaobject && userErrors.length === 0
      ? { id: metaobject.id }
      : { errors: userErrors.map((error) => error.message) };
  }
  const data = await ask<{
    metaobjectCreate: {
      metaobject: { id: string } | null;
      userErrors: UserError[];
    };
  }>(admin, CREATE_MUTATION, { metaobject: { type: SIZE_CHART_TYPE, values } });
  const { metaobject, userErrors } = data.metaobjectCreate;
  return metaobject && userErrors.length === 0
    ? { id: metaobject.id }
    : { errors: userErrors.map((error) => error.message) };
}

export async function deleteSizeChart(
  admin: AdminApiContext,
  id: string,
): Promise<string[]> {
  const data = await ask<{
    metaobjectDelete: { deletedId: string | null; userErrors: UserError[] };
  }>(admin, DELETE_MUTATION, { id });
  return data.metaobjectDelete.userErrors.map((error) => error.message);
}

// Names for the products and collections in the rules.
export async function loadRuleTitles(
  admin: AdminApiContext,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const data = await ask<{
      nodes: ({ id: string; title?: string } | null)[];
    }>(admin, TITLES_QUERY, { ids: [...new Set(ids)].slice(0, 250) });
    return Object.fromEntries(
      data.nodes.flatMap((node) =>
        node?.title ? [[node.id, node.title] as const] : [],
      ),
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Size chart rule names:", error);
    return {};
  }
}
