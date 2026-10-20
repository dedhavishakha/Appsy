import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext } from "react";
import { formatMoney, type Money } from "./format";

// Currency conversion for display, as in Seeaash. The merchant turns it on in Appsy's
// Settings. Shopify still sets every price (each market's own price and currency); this
// only shows that price in the shopper's chosen currency. Checkout charges the market's
// currency, and the bag says so.

// ExchangeRate-API's free open access: no key, updated once a day, commercial use allowed,
// attribution required, no redistribution, so each phone fetches its own copy
// (https://www.exchangerate-api.com/docs/free).
export const RATES_URL = "https://open.er-api.com/v6/latest/USD";
export const RATES_ATTRIBUTION_URL = "https://www.exchangerate-api.com";

// Units of each currency per US dollar.
export type Rates = { updatedAt: number; rates: Record<string, number> };

const RATES_KEY = "appsy.rates";

// Today's rates, or the last ones kept on the phone when offline or the service is down.
export async function fetchRates(): Promise<Rates> {
  try {
    const response = await fetch(RATES_URL);
    const json = (await response.json()) as {
      result?: string;
      time_last_update_unix?: number;
      rates?: Record<string, number>;
    };
    if (json.result !== "success" || !json.rates?.USD) throw new Error("The exchange rates didn't load.");
    const rates = { updatedAt: (json.time_last_update_unix ?? 0) * 1000, rates: json.rates };
    AsyncStorage.setItem(RATES_KEY, JSON.stringify(rates)).catch(() => {});
    return rates;
  } catch (error) {
    const kept = await AsyncStorage.getItem(RATES_KEY).catch(() => null);
    if (kept) return JSON.parse(kept) as Rates;
    throw error;
  }
}

export type CurrencyControls = {
  // Whether the merchant turned conversion on.
  enabled: boolean;
  // "auto" (the phone's currency) or a currency code the shopper picked.
  choice: string;
  setChoice: (choice: string) => void;
  // The phone's own currency, for the "Automatic" choice.
  phoneCurrency: string | null;
  // The currency prices are shown in, or null to show Shopify's prices as they are.
  display: string | null;
  rates: Rates | null;
};

export const CurrencyContext = createContext<CurrencyControls | null>(null);

export function useCurrency(): CurrencyControls {
  const controls = useContext(CurrencyContext);
  if (!controls) throw new Error("useCurrency needs CurrencyProvider from components/currency-provider.tsx");
  return controls;
}

// Shows prices: Shopify's price for the shopper's market, converted into their chosen
// currency when the merchant has conversion on and rates have loaded.
export function useMoney() {
  const { display, rates } = useCurrency();

  const convert = (money: Money): Money => {
    if (!display || !rates || money.currencyCode === display) return money;
    const to = rates.rates[display];
    const from = rates.rates[money.currencyCode];
    if (!to || !from) return money;
    return { amount: String((Number(money.amount) * to) / from), currencyCode: display };
  };

  return {
    // Whether a price in this currency is shown converted.
    converts: (currencyCode: string) => convert({ amount: "1", currencyCode }).currencyCode !== currencyCode,
    format: (money: Money | null | undefined) => {
      if (!money) return "";
      const shown = convert(money);
      // Converted prices are estimates: whole units for currencies Seeaash shows that way.
      return formatMoney(shown, shown !== money && WHOLE_CURRENCIES.includes(shown.currencyCode));
    },
  };
}

// Shown without decimals once converted, as in Seeaash.
const WHOLE_CURRENCIES = ["INR", "JPY", "KRW"];

// Currencies listed first in the picker, after the store's own.
export const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "SGD", "SAR", "JPY"];

// A currency's name, e.g. "Indian Rupee"; just the code where the phone can't name it.
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// A flag for a currency: most codes start with their country's code (USD → US); the euro
// gets the EU flag, and shared currencies (X…) a globe.
export function currencyFlag(code: string): string {
  const upper = code.toUpperCase();
  if (upper === "EUR") return "🇪🇺";
  if (upper.startsWith("X") || !/^[A-Z]{3}$/.test(upper)) return "🌐";
  return String.fromCodePoint(...[...upper.slice(0, 2)].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
