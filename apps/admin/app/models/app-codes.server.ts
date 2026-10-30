import { randomInt } from "node:crypto";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  CODE_START_LENGTH,
  CODE_START_LETTERS,
  withoutCodeStart,
} from "@appsy/app-config";

// App-only discount codes on Appsy's Functionality page: the store's code start, and the
// codes it has made with it in Shopify (app-config app-codes.ts).

// A new code start. Random, so one store's start says nothing about another's.
export function newCodeStart(previous: string | null = null): string {
  for (;;) {
    let start = "";
    for (let index = 0; index < CODE_START_LENGTH; index += 1) {
      start += CODE_START_LETTERS[randomInt(CODE_START_LETTERS.length)];
    }
    if (start !== previous) return start;
  }
}

// Whether the store has granted read_discounts (write_discounts includes it).
export async function hasDiscountsAccess(scopes: {
  query: () => Promise<{ granted: string[] }>;
}): Promise<boolean> {
  return scopes
    .query()
    .then(
      ({ granted }) =>
        granted.includes("read_discounts") ||
        granted.includes("write_discounts"),
    )
    .catch(() => false);
}

// Code discounts, most recently changed first. Shopify's docs don't say its code search
// matches the start of a code, so Appsy reads them and keeps the ones with the store's start.
// On API 2026-07, Shopify leaves out discounts that a running rollout reaches differently
// from what their dates say (shopify.dev, discounts/rollouts), so their status is accurate.
const CODE_DISCOUNTS_QUERY = `#graphql
  query AppsyAppCodes($after: String) {
    discountNodes(
      first: 50
      after: $after
      query: "method:code"
      sortKey: UPDATED_AT
      reverse: true
    ) {
      nodes {
        id
        discount {
          __typename
          ... on DiscountCodeBasic {
            status
            summary
            asyncUsageCount
            codesCount { count }
            codes(first: 1) { nodes { code } }
          }
          ... on DiscountCodeBxgy {
            status
            summary
            asyncUsageCount
            codesCount { count }
            codes(first: 1) { nodes { code } }
          }
          ... on DiscountCodeFreeShipping {
            status
            summary
            asyncUsageCount
            codesCount { count }
            codes(first: 1) { nodes { code } }
          }
          ... on DiscountCodeApp {
            status
            asyncUsageCount
            codesCount { count }
            codes(first: 1) { nodes { code } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

// The 200 most recently changed code discounts, so the page loads quickly.
const MAX_PAGES = 4;

type CodeDiscount = {
  status?: "ACTIVE" | "EXPIRED" | "SCHEDULED";
  summary?: string | null;
  asyncUsageCount?: number;
  codesCount?: { count: number } | null;
  codes?: { nodes: { code: string }[] };
};

type DiscountsPage = {
  data?: {
    discountNodes: {
      nodes: { id: string; discount: CodeDiscount }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: unknown;
};

export type AppCode = {
  // The discount, for Shopify's own edit page (Intents API).
  id: string;
  // What shoppers type in the app, and the whole code in Shopify.
  shown: string;
  code: string;
  // More than 1 when the discount holds many codes made in bulk.
  codes: number;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED";
  summary: string | null;
  used: number;
};

export type AppCodeList =
  { available: true; codes: AppCode[]; capped: boolean } | { available: false };

// The store's discounts whose code starts with its code start. If Shopify refuses, the
// page says so instead of failing; a thrown Response (sign in again) still goes through.
export async function loadAppCodes(
  admin: AdminApiContext,
  start: string,
): Promise<AppCodeList> {
  const codes: AppCode[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await admin.graphql(CODE_DISCOUNTS_QUERY, {
        variables: { after },
      });
      const body = (await response.json()) as DiscountsPage;
      if (body.errors || !body.data) {
        console.error("App-only codes:", JSON.stringify(body.errors));
        return { available: false };
      }
      for (const { id, discount } of body.data.discountNodes.nodes) {
        const code = discount.codes?.nodes[0]?.code;
        if (!code || !discount.status) continue;
        const shown = withoutCodeStart(code, start);
        if (shown === code) continue;
        codes.push({
          id,
          shown,
          code,
          codes: discount.codesCount?.count ?? 1,
          status: discount.status,
          summary: discount.summary ?? null,
          used: discount.asyncUsageCount ?? 0,
        });
      }
      const { hasNextPage, endCursor } = body.data.discountNodes.pageInfo;
      if (!hasNextPage) return { available: true, codes, capped: false };
      after = endCursor;
    }
    return { available: true, codes, capped: true };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("App-only codes:", error);
    return { available: false };
  }
}
