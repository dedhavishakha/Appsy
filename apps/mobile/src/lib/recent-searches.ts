import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "appsy.recentSearches";
const MAX = 8;

// The shopper's last searches, kept on the phone only.
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        const list: unknown = saved ? JSON.parse(saved) : [];
        if (Array.isArray(list)) {
          setRecent(list.filter((item): item is string => typeof item === "string").slice(0, MAX));
        }
      })
      .catch(() => {});
  }, []);

  const save = (list: string[]) => {
    setRecent(list);
    AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
  };

  return {
    recent,
    add: (term: string) =>
      save([term, ...recent.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, MAX)),
    clear: () => save([]),
  };
}
