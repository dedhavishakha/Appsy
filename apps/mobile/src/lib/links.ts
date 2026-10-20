import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import type { LinkValue, PublishedSettings } from "@appsy/app-config";
import type { MenuItemData } from "./queries";

// Opens where a banner points. Collections and products open in the app, found by id so a
// renamed handle still works; Shopify pages and web addresses open in an in-app browser.
export function openLink(link: LinkValue) {
  switch (link.type) {
    case "collection":
      router.push({ pathname: "/collections/[handle]", params: { handle: link.handle, id: link.id } });
      return;
    case "product":
      router.push({ pathname: "/products/[handle]", params: { handle: link.handle, id: link.id } });
      return;
    case "page":
    case "url":
      void WebBrowser.openBrowserAsync(link.url);
  }
}

// What screen readers say for a banner without a heading or button text.
export function linkLabel(link: LinkValue) {
  return link.type === "url" ? "Open link" : link.title || "Open link";
}

type MenuTarget =
  | { kind: "home" }
  | { kind: "collection" | "product"; handle: string; id?: string }
  | { kind: "web"; url: string };

// Where a Shopify menu item goes, like Seeaash's routeForUrl: Home, and the store's
// collections and products, open in the app; anything else opens in an in-app browser.
// Null for items that go nowhere, such as "#".
export function menuItemTarget(
  item: MenuItemData,
  shop: PublishedSettings["shop"],
): MenuTarget | null {
  const { resource } = item;
  if (resource?.handle && (resource.__typename === "Collection" || resource.__typename === "Product")) {
    return {
      kind: resource.__typename === "Collection" ? "collection" : "product",
      handle: resource.handle,
      id: resource.id,
    };
  }
  if (item.type === "FRONTPAGE") return { kind: "home" };

  let url: URL;
  try {
    url = new URL(item.url ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // An address typed into the menu that points at the store's own website.
  const storeHost = new URL(shop.storefrontUrl).host;
  if ([storeHost, `www.${storeHost}`, shop.domain].includes(url.host)) {
    // "#" is a placeholder for an item that only groups others.
    if (url.pathname === "/") return url.hash ? null : { kind: "home" };
    const match = /\/(collections|products)\/([^/?#]+)\/?$/.exec(url.pathname);
    // "All products" (/collections/all) isn't a collection the app can load by handle.
    if (match?.[1] && match[2] && match[2] !== "all") {
      return {
        kind: match[1] === "collections" ? "collection" : "product",
        handle: decodeURIComponent(match[2]),
      };
    }
  }
  return { kind: "web", url: url.href };
}

export function openMenuTarget(target: MenuTarget) {
  switch (target.kind) {
    case "home":
      router.navigate("/");
      return;
    case "collection":
    case "product":
      router.push({
        pathname: target.kind === "collection" ? "/collections/[handle]" : "/products/[handle]",
        params: target.id ? { handle: target.handle, id: target.id } : { handle: target.handle },
      });
      return;
    case "web":
      void WebBrowser.openBrowserAsync(target.url);
  }
}

// A chat in WhatsApp with the store's number (WhatsApp's click-to-chat link), opening the
// app when it's installed.
export function openWhatsApp(phone: string, message: string) {
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}${text}`);
}

export function callPhone(phone: string) {
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
}

export function sendEmail(email: string) {
  void Linking.openURL(`mailto:${email}`);
}
