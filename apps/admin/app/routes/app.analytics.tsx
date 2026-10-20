import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  formatCount,
  formatMoney,
  MetricsCard,
  percentChange,
} from "../components/metrics-card";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { RANGE_DAYS, type RangeDays } from "../models/analytics-range";
import { hasOrdersAccess, loadReport } from "../models/analytics.server";

// Analytics (docs/03, section J): how shoppers use the merchant's app, from the events it
// sends once they allow usage data, and the orders placed in it, read from Shopify.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const days = RANGE_DAYS.find((range) => range === asked) ?? 30;
  return loadReport(
    admin,
    shop.appProject.id,
    days,
    await hasOrdersAccess(scopes),
  );
};

const RANGE_LABELS: Record<RangeDays, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  60: "Last 60 days",
};

export default function Analytics() {
  const report = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { current, previous, sales, previousSales } = report;
  const conversion =
    sales.available && current.sessions > 0
      ? (sales.orders / current.sessions) * 100
      : null;
  const previousConversion =
    previousSales.available && previous.sessions > 0
      ? (previousSales.orders / previous.sessions) * 100
      : null;
  const nothingYet = current.devices === 0 && previous.devices === 0;

  return (
    <s-page heading="Analytics">
      <s-stack gap="base">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
          <s-paragraph color="subdued">
            Compared with the {report.days} days before. Days follow your
            store&apos;s time zone ({report.timeZone}).
          </s-paragraph>
          <s-select
            label="Date range"
            labelAccessibilityVisibility="exclusive"
            value={String(report.days)}
            onChange={(event) => navigate(`?days=${event.currentTarget.value}`)}
          >
            {RANGE_DAYS.map((days) => (
              <s-option key={days} value={String(days)}>
                {RANGE_LABELS[days]}
              </s-option>
            ))}
          </s-select>
        </s-grid>

        {nothingYet && (
          <s-banner tone="info" heading="No app activity yet">
            <s-paragraph>
              Numbers appear once shoppers open your app and allow usage data.
              The app asks them the first time they open it.
            </s-paragraph>
          </s-banner>
        )}

        <s-heading>Shoppers</s-heading>
        <MetricsCard
          metrics={[
            {
              label: "New installs",
              value: formatCount(current.installs),
              change: percentChange(current.installs, previous.installs),
            },
            {
              label: "Active phones",
              value: formatCount(current.devices),
              change: percentChange(current.devices, previous.devices),
            },
            {
              label: "Sessions",
              value: formatCount(current.sessions),
              change: percentChange(current.sessions, previous.sessions),
            },
          ]}
        />

        <s-heading>Shopping</s-heading>
        <MetricsCard
          metrics={[
            {
              label: "Product views",
              value: formatCount(current.productViews),
              change: percentChange(
                current.productViews,
                previous.productViews,
              ),
            },
            {
              label: "Added to bag",
              value: formatCount(current.addedToBag),
              change: percentChange(current.addedToBag, previous.addedToBag),
            },
            {
              label: "Checkouts started",
              value: formatCount(current.checkouts),
              change: percentChange(current.checkouts, previous.checkouts),
            },
          ]}
        />

        <s-heading>Sales from your app</s-heading>
        {sales.available ? (
          <MetricsCard
            metrics={[
              {
                label: "Orders",
                value: formatCount(sales.orders),
                change: previousSales.available
                  ? percentChange(sales.orders, previousSales.orders)
                  : null,
                note: sales.capped
                  ? "The first 5,000 orders in this period"
                  : undefined,
              },
              {
                label: "Sales",
                value: formatMoney(sales.amount, sales.currency),
                change: previousSales.available
                  ? percentChange(sales.amount, previousSales.amount)
                  : null,
              },
              {
                label: "Orders per session",
                value: conversion === null ? "—" : `${conversion.toFixed(1)}%`,
                change:
                  conversion !== null && previousConversion
                    ? percentChange(conversion, previousConversion)
                    : null,
              },
            ]}
          />
        ) : (
          <s-banner tone="info" heading="Orders and sales appear later">
            <s-paragraph>
              Appsy reads only the orders placed in your app. Shopify allows
              this when it reviews Appsy, so these numbers appear then.
            </s-paragraph>
          </s-banner>
        )}

        <s-section heading="By day">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Day</s-table-header>
              <s-table-header format="numeric">Sessions</s-table-header>
              <s-table-header format="numeric">Product views</s-table-header>
              <s-table-header format="numeric">Added to bag</s-table-header>
              <s-table-header format="numeric">Checkouts</s-table-header>
              {sales.available && (
                <s-table-header format="numeric">Orders</s-table-header>
              )}
              {sales.available && (
                <s-table-header format="currency">Sales</s-table-header>
              )}
            </s-table-header-row>
            <s-table-body>
              {report.byDay.map((row) => (
                <s-table-row key={row.day}>
                  <s-table-cell>{formatDay(row.day)}</s-table-cell>
                  <s-table-cell>{formatCount(row.sessions)}</s-table-cell>
                  <s-table-cell>{formatCount(row.productViews)}</s-table-cell>
                  <s-table-cell>{formatCount(row.addedToBag)}</s-table-cell>
                  <s-table-cell>{formatCount(row.checkouts)}</s-table-cell>
                  {sales.available && (
                    <s-table-cell>{formatCount(row.orders)}</s-table-cell>
                  )}
                  {sales.available && (
                    <s-table-cell>
                      {formatMoney(row.sales, sales.currency)}
                    </s-table-cell>
                  )}
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>

        <s-paragraph color="subdued">
          App activity counts only shoppers who allowed usage data. It never
          includes names, emails or what shoppers type.
        </s-paragraph>
      </s-stack>
    </s-page>
  );
}

// "2026-10-16" as "Thu, 16 Oct".
function formatDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
