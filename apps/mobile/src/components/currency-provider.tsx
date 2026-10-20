import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/app-settings";
import { CurrencyContext, fetchRates } from "@/lib/currency";

const KEY = "appsy.currency";

function phoneCurrency(): string | null {
  try {
    return getLocales()[0]?.currencyCode ?? null;
  } catch {
    return null;
  }
}

// The shopper's display currency, when the merchant has conversion on: "Automatic" follows
// the phone's currency; any other choice is kept on the phone. Rates load only while
// conversion is on, are fresh for six hours, and the last good ones work offline.
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const enabled = useSettings().markets.displayCurrencyConversion;
  const [choice, setChoiceState] = useState("auto");
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => saved && setChoiceState(saved))
      .catch(() => {});
  }, []);

  const rates = useQuery({
    queryKey: ["fx-rates"],
    queryFn: fetchRates,
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: Infinity,
  });

  const setChoice = useCallback((next: string) => {
    setChoiceState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const phone = useMemo(phoneCurrency, []);
  const controls = useMemo(
    () => ({
      enabled,
      choice,
      setChoice,
      phoneCurrency: phone,
      display: enabled ? (choice === "auto" ? phone : choice) : null,
      rates: rates.data ?? null,
    }),
    [enabled, choice, setChoice, phone, rates.data],
  );
  return <CurrencyContext.Provider value={controls}>{children}</CurrencyContext.Provider>;
}
