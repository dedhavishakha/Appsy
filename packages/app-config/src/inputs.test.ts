import { describe, expect, it } from "vitest";
import { z } from "zod";
import { input, settingsForm } from "./index";

const banner = z.object({ image: input.image("Picture"), link: input.link("Link") });

describe("picture and link inputs", () => {
  it("start empty", () => {
    expect(banner.parse({})).toEqual({ image: null, link: null });
  });

  it("keep a picture from Shopify Files", () => {
    const image = {
      id: "gid://shopify/MediaImage/1",
      url: "https://cdn.shopify.com/s/files/1/banner.jpg",
      width: 1200,
      height: 600,
    };
    expect(banner.parse({ image }).image).toEqual({ ...image, alt: "" });
  });

  it("keep each kind of link", () => {
    const links = [
      { type: "collection", id: "gid://shopify/Collection/1", handle: "sale", title: "Sale" },
      { type: "product", id: "gid://shopify/Product/2", handle: "linen-shirt", title: "Linen shirt" },
      { type: "page", id: "gid://shopify/Page/3", title: "About us", url: "https://example.com/pages/about" },
      { type: "url", url: "https://example.com/lookbook" },
    ];
    for (const link of links) expect(banner.parse({ link }).link).toEqual(link);
  });

  it("treat a link type an older phone doesn't know as no link", () => {
    expect(banner.parse({ link: { type: "blog", id: "gid://shopify/Blog/1" } }).link).toBeNull();
  });

  it("never keep a web address that isn't https", () => {
    expect(banner.parse({ link: { type: "url", url: "http://example.com" } }).link).toBeNull();
  });

  it("tell the editor which controls to draw", () => {
    const form = settingsForm(banner);
    expect(form.properties.image?.input).toBe("image_picker");
    expect(form.properties.link?.input).toBe("url");
  });
});

describe("product and date-time inputs", () => {
  const promo = z.object({
    product: input.product("Product"),
    endsAt: input.datetime("Ends at"),
  });

  it("start empty", () => {
    expect(promo.parse({})).toEqual({ product: null, endsAt: null });
  });

  it("keep a product id and a UTC moment", () => {
    const value = { product: "gid://shopify/Product/7", endsAt: "2026-12-24T18:30:00.000Z" };
    expect(promo.parse(value)).toEqual(value);
  });

  it("treat an unreadable date as no date", () => {
    expect(promo.parse({ endsAt: "next Tuesday" }).endsAt).toBeNull();
  });
});
