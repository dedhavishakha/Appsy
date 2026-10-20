import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/app-settings";
import { CountryContext } from "@/lib/country";
import { COUNTRIES_QUERY, type CountriesData } from "@/lib/queries";
import { storefront } from "@/lib/storefront";

const KEY = "appsy.country";

// The phone's region setting, e.g. "IN": a first guess at where the shopper is.
function deviceRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

// Works out the shopper's country and shares it: their own choice, else the phone's region,
// else the design's default country, as long as the store sells there (Shopify Markets);
// otherwise the store's default country. The answer is kept on the phone, so the next start
// asks Shopify for the right prices straight away.
export function CountryProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const fallback = settings.markets.defaultCountry;
  const [saved, setSaved] = useState<{ loaded: boolean; code: string | null }>({ loaded: false, code: null });
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((code) => setSaved({ loaded: true, code }))
      .catch(() => setSaved({ loaded: true, code: null }));
  }, []);

  const list = useQuery({
    queryKey: ["countries"],
    queryFn: () => storefront<CountriesData>(settings.shop, COUNTRIES_QUERY),
    staleTime: 60 * 60 * 1000,
  });
  const countries = useMemo(
    () => [...(list.data?.localization.availableCountries ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [list.data],
  );

  let country = saved.code ?? fallback;
  if (countries.length > 0) {
    const sold = (code: string | null): code is string =>
      code !== null && countries.some((option) => option.isoCode === code);
    country =
      [saved.code, deviceRegion(), fallback].find(sold) ?? list.data?.localization.country.isoCode ?? fallback;
  }

  const setCountry = useCallback((code: string) => {
    setSaved({ loaded: true, code });
    AsyncStorage.setItem(KEY, code).catch(() => {});
  }, []);

  useEffect(() => {
    if (saved.loaded && countries.length > 0 && country !== saved.code) setCountry(country);
  }, [saved, countries.length, country, setCountry]);

  const controls = useMemo(() => ({ country, countries, setCountry }), [country, countries, setCountry]);
  // A moment at start, so the first store queries already use the shopper's country.
  if (!saved.loaded) return null;
  return <CountryContext.Provider value={controls}>{children}</CountryContext.Provider>;
}
