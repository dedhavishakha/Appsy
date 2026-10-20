import { createContext, useContext } from "react";
import type { CountryOption } from "./queries";

// The shopper's country (components/country-provider.tsx): every store query asks for its
// prices and currency (Shopify Markets), and the bag ships there.
export type CountryControls = {
  country: string;
  // The countries the store sells to, by name. Empty until Shopify answers.
  countries: CountryOption[];
  setCountry: (code: string) => void;
};

export const CountryContext = createContext<CountryControls | null>(null);

export function useCountry(): CountryControls {
  const controls = useContext(CountryContext);
  if (!controls) throw new Error("useCountry needs CountryProvider from components/country-provider.tsx");
  return controls;
}

// An emoji flag from a two-letter country code; iOS and Android draw it natively.
export function flagFor(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳️";
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
