import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WishlistContext, type WishlistItem } from "@/lib/wishlist";

const KEY = "appsy.wishlist";

// The shopper's wishlist, kept on the phone: the app's own storage, which stays until the
// app is removed (in the editor's preview, the browser's storage). Newest first. Signed-in
// shoppers' lists will also be kept in Shopify (Phase 3, with sign-in).
export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  // The list as of the last change, so a tap knows at once whether it saved or unsaved.
  const latest = useRef(items);

  const update = useCallback((next: WishlistItem[]) => {
    latest.current = next;
    setItems(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        const list: unknown = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(list)) return;
        const kept = list as WishlistItem[];
        // Anything saved in the moment before the list loaded stays on top.
        const current = latest.current;
        if (current.length === 0) {
          latest.current = kept;
          setItems(kept);
        } else {
          update([...current, ...kept.filter((item) => !current.some((c) => c.id === item.id))]);
        }
      })
      .catch(() => {});
  }, [update]);

  const toggle = useCallback(
    (item: WishlistItem) => {
      const current = latest.current;
      const added = !current.some((saved) => saved.id === item.id);
      update(added ? [item, ...current] : current.filter((saved) => saved.id !== item.id));
      return added;
    },
    [update],
  );

  const remove = useCallback(
    (id: string) => update(latest.current.filter((saved) => saved.id !== id)),
    [update],
  );

  const wishlist = useMemo(
    () => ({ items, has: (id: string) => items.some((item) => item.id === id), toggle, remove }),
    [items, toggle, remove],
  );
  return <WishlistContext.Provider value={wishlist}>{children}</WishlistContext.Provider>;
}
