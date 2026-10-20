import { createContext, useContext } from "react";
import { useSettings } from "./app-settings";
import type { Money } from "./format";
import type { ProductCardData } from "./queries";

// A saved product, with enough to draw it before fresh prices arrive (or offline).
export type WishlistItem = {
  id: string;
  handle: string;
  title: string;
  image: { url: string; altText: string | null } | null;
  price: Money;
};

export type Wishlist = {
  items: WishlistItem[];
  has: (id: string) => boolean;
  // Saves or unsaves a product; true when it was saved.
  toggle: (item: WishlistItem) => boolean;
  remove: (id: string) => void;
};

// Shared by components/wishlist-provider.tsx, which keeps the list on the phone.
export const WishlistContext = createContext<Wishlist | null>(null);

export function useWishlist(): Wishlist {
  const wishlist = useContext(WishlistContext);
  if (!wishlist) throw new Error("useWishlist needs WishlistProvider from app/_layout.tsx");
  return wishlist;
}

// Whether the merchant has the wishlist switched on (Appsy's Settings page).
export function useWishlistEnabled(): boolean {
  return useSettings().features.wishlist?.enabled === true;
}

export function wishlistItem(product: ProductCardData): WishlistItem {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    image: product.featuredImage,
    price: product.priceRange.minVariantPrice,
  };
}
