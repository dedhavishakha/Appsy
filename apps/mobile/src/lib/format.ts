export type Money = { amount: string; currencyCode: string };

const formatters = new Map<string, Intl.NumberFormat>();

// "₹25,500" or "$19.99": the currency's own format, with Indian digit grouping for rupees.
export function formatMoney(money: Money): string {
  let formatter = formatters.get(money.currencyCode);
  if (!formatter) {
    formatter = new Intl.NumberFormat(money.currencyCode === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency: money.currencyCode,
    });
    formatters.set(money.currencyCode, formatter);
  }
  return formatter.format(Number(money.amount));
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
