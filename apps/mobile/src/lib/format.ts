export type Money = { amount: string; currencyCode: string };

const formatters = new Map<string, Intl.NumberFormat | null>();

// "₹25,500" or "$19.99": the currency's own format, with Indian digit grouping for rupees.
// `whole` drops the decimals (for converted estimates). A phone that can't format a
// currency shows "AED 120.00" instead.
export function formatMoney(money: Money, whole = false): string {
  const { currencyCode } = money;
  const key = `${currencyCode}${whole ? ":whole" : ""}`;
  if (!formatters.has(key)) {
    try {
      formatters.set(
        key,
        new Intl.NumberFormat(currencyCode === "INR" ? "en-IN" : "en", {
          style: "currency",
          currency: currencyCode,
          ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
        }),
      );
    } catch {
      formatters.set(key, null);
    }
  }
  const amount = Number(money.amount);
  try {
    const formatter = formatters.get(key);
    if (formatter) return formatter.format(amount);
  } catch {}
  return `${currencyCode} ${amount.toFixed(whole ? 0 : 2)}`;
}

export function isDiscounted(price: Money, compareAt: Money | null | undefined) {
  return !!compareAt && Number(compareAt.amount) > Number(price.amount);
}

// A resized Shopify CDN image URL; Shopify serves the size on the fly.
export function imageUrl(url: string | null | undefined, width: number) {
  if (!url) return undefined;
  const size = Math.min(Math.round(width), 2048);
  return `${url}${url.includes("?") ? "&" : "?"}width=${size}`;
}
