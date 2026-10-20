import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import type { RangeDays } from "./analytics-range";

// The dashboard's numbers (docs/03, section J). App activity comes from the events phones
// send after shoppers allow it (routes/api.events.$appId.tsx). Orders and sales come from
// the orders Appsy's channel created, read from Shopify each time: store data stays in
// Shopify (read_only_own_orders, App Store requirement 5.7.1).

export type Activity = {
  installs: number;
  devices: number;
  sessions: number;
  productViews: number;
  addedToBag: number;
  checkouts: number;
  wishlistAdds: number;
};

export type DayRow = {
  day: string;
  sessions: number;
  productViews: number;
  addedToBag: number;
  checkouts: number;
  orders: number;
  sales: number;
};

export type Sales =
  | {
      available: true;
      orders: number;
      amount: number;
      currency: string;
      capped: boolean;
    }
  | { available: false };

export type Report = {
  days: RangeDays;
  timeZone: string;
  current: Activity;
  previous: Activity;
  sales: Sales;
  previousSales: Sales;
  byDay: DayRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const SHOP_CLOCK_QUERY = `#graphql
  query AppsyShopClock {
    shop { ianaTimezone currencyCode }
  }`;

// The app's orders and their totals now (after edits and refunds), newest last.
const APP_ORDERS_QUERY = `#graphql
  query AppsyAppOrders($query: String!, $after: String) {
    orders(first: 250, after: $after, query: $query, sortKey: CREATED_AT) {
      nodes {
        createdAt
        currentTotalPriceSet { shopMoney { amount currencyCode } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

// At most 5,000 orders per period, so a busy store's page still loads quickly.
const MAX_ORDER_PAGES = 20;

type OrdersPage = {
  data?: {
    orders: {
      nodes: {
        createdAt: string;
        currentTotalPriceSet: {
          shopMoney: { amount: string; currencyCode: string };
        };
      }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: unknown;
};

// `ordersAccess`: whether Shopify has granted read_only_own_orders, which it adds when it
// reviews Appsy (App Store requirement 5.7.1). Until then, orders aren't asked for.
export async function loadReport(
  admin: AdminApiContext,
  appProjectId: string,
  days: RangeDays,
  ordersAccess: boolean,
): Promise<Report> {
  const shop = await admin
    .graphql(SHOP_CLOCK_QUERY)
    .then((response) => response.json())
    .then(
      (body: {
        data?: { shop: { ianaTimezone: string; currencyCode: string } };
      }) => body.data?.shop,
    )
    .catch(() => undefined);
  const timeZone = shop?.ianaTimezone ?? "UTC";
  const currency = shop?.currencyCode ?? "USD";
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  const before = new Date(from.getTime() - days * DAY_MS);

  const [current, previous, activityByDay, orders, previousOrders] =
    await Promise.all([
      loadActivity(appProjectId, from, to),
      loadActivity(appProjectId, before, from),
      loadActivityByDay(appProjectId, from, to, timeZone),
      ordersAccess ? loadOrders(admin, from, to) : NO_ORDERS,
      ordersAccess ? loadOrders(admin, before, from) : NO_ORDERS,
    ]);

  // Every day in the period, newest first, with orders added in.
  const byDay = new Map<string, DayRow>();
  for (let time = to.getTime(); time > from.getTime(); time -= DAY_MS) {
    const day = dayKey(new Date(time), timeZone);
    byDay.set(day, {
      day,
      sessions: 0,
      productViews: 0,
      addedToBag: 0,
      checkouts: 0,
      orders: 0,
      sales: 0,
    });
  }
  for (const row of activityByDay) {
    const entry = byDay.get(row.day);
    if (entry) Object.assign(entry, { ...row, day: entry.day });
  }
  if (orders.available) {
    for (const order of orders.list) {
      const entry = byDay.get(dayKey(new Date(order.createdAt), timeZone));
      if (!entry) continue;
      entry.orders += 1;
      entry.sales += order.amount;
    }
  }

  return {
    days,
    timeZone,
    current,
    previous,
    sales: summarize(orders, currency),
    previousSales: summarize(previousOrders, currency),
    byDay: [...byDay.values()],
  };
}

type CountRow = Record<keyof Activity, bigint>;

async function loadActivity(
  appProjectId: string,
  from: Date,
  to: Date,
): Promise<Activity> {
  const [row] = await db.$queryRaw<CountRow[]>`
    SELECT
      count(*) FILTER (WHERE name = 'first_open') AS installs,
      count(DISTINCT "deviceId") AS devices,
      count(*) FILTER (WHERE name = 'app_open') AS sessions,
      count(*) FILTER (WHERE name = 'product_view') AS "productViews",
      count(*) FILTER (WHERE name = 'add_to_cart') AS "addedToBag",
      count(*) FILTER (WHERE name = 'checkout_started') AS checkouts,
      count(*) FILTER (WHERE name = 'wishlist_add') AS "wishlistAdds"
    FROM "AnalyticsEvent"
    WHERE "appProjectId" = ${appProjectId}::uuid
      AND "occurredAt" >= (${from}::timestamptz AT TIME ZONE 'UTC')
      AND "occurredAt" < (${to}::timestamptz AT TIME ZONE 'UTC')`;
  return {
    installs: Number(row?.installs ?? 0),
    devices: Number(row?.devices ?? 0),
    sessions: Number(row?.sessions ?? 0),
    productViews: Number(row?.productViews ?? 0),
    addedToBag: Number(row?.addedToBag ?? 0),
    checkouts: Number(row?.checkouts ?? 0),
    wishlistAdds: Number(row?.wishlistAdds ?? 0),
  };
}

type DayCountRow = { day: string } & Record<
  "sessions" | "productViews" | "addedToBag" | "checkouts",
  bigint
>;

// Days in the shop's time zone, as Shopify's own reports count them. Event times are
// stored in UTC.
async function loadActivityByDay(
  appProjectId: string,
  from: Date,
  to: Date,
  timeZone: string,
) {
  const rows = await db.$queryRaw<DayCountRow[]>`
    SELECT
      to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE name = 'app_open') AS sessions,
      count(*) FILTER (WHERE name = 'product_view') AS "productViews",
      count(*) FILTER (WHERE name = 'add_to_cart') AS "addedToBag",
      count(*) FILTER (WHERE name = 'checkout_started') AS checkouts
    FROM "AnalyticsEvent"
    WHERE "appProjectId" = ${appProjectId}::uuid
      AND "occurredAt" >= (${from}::timestamptz AT TIME ZONE 'UTC')
      AND "occurredAt" < (${to}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1`;
  return rows.map((row) => ({
    day: row.day,
    sessions: Number(row.sessions),
    productViews: Number(row.productViews),
    addedToBag: Number(row.addedToBag),
    checkouts: Number(row.checkouts),
  }));
}

type OrderList =
  | {
      available: true;
      list: { createdAt: string; amount: number }[];
      capped: boolean;
    }
  | { available: false };

const NO_ORDERS: OrderList = { available: false };

// Whether Shopify has granted the app read_only_own_orders: the scopes the store granted,
// read the way the editor checks its own.
export async function hasOrdersAccess(scopes: {
  query: () => Promise<{ granted: string[] }>;
}): Promise<boolean> {
  return scopes
    .query()
    .then((result) => result.granted.includes("read_only_own_orders"))
    .catch(() => false);
}

// Only the orders Appsy's channel created: that's all read_only_own_orders shows. If the
// request fails anyway, the dashboard says orders appear later instead of failing.
async function loadOrders(
  admin: AdminApiContext,
  from: Date,
  to: Date,
): Promise<OrderList> {
  const query = `created_at:>='${from.toISOString()}' AND created_at:<'${to.toISOString()}'`;
  const list: { createdAt: string; amount: number }[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
      const response = await admin.graphql(APP_ORDERS_QUERY, {
        variables: { query, after },
      });
      const body = (await response.json()) as OrdersPage;
      if (body.errors || !body.data) {
        console.error("App orders:", JSON.stringify(body.errors));
        return { available: false };
      }
      // Amounts are in the shop's currency (shopMoney).
      for (const order of body.data.orders.nodes) {
        const amount = Number(order.currentTotalPriceSet.shopMoney.amount);
        list.push({ createdAt: order.createdAt, amount });
      }
      const { hasNextPage, endCursor } = body.data.orders.pageInfo;
      if (!hasNextPage) return { available: true, list, capped: false };
      after = endCursor;
    }
    return { available: true, list, capped: true };
  } catch (error) {
    console.error("App orders:", error);
    return { available: false };
  }
}

function summarize(orders: OrderList, currency: string): Sales {
  if (!orders.available) return { available: false };
  return {
    available: true,
    orders: orders.list.length,
    amount: orders.list.reduce((sum, order) => sum + order.amount, 0),
    currency,
    capped: orders.capped,
  };
}

// A date as YYYY-MM-DD in the shop's time zone.
function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
