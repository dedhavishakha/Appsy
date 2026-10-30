import { describe, expect, it } from "vitest";
import {
  checkGoogleServices,
  ga4AddToCart,
  ga4BeginCheckout,
  ga4Purchase,
  ga4ViewItem,
  ga4ViewItemList,
} from "./index";

const tee = {
  productId: "gid://shopify/Product/101",
  name: "Cotton tee",
  variant: "M / Blue",
  brand: "Local noodle",
  price: 499.5,
};

describe("GA4 events", () => {
  it("send a product with Shopify's number as the item id", () => {
    expect(ga4ViewItem("INR", tee)).toEqual({
      name: "view_item",
      params: {
        currency: "INR",
        value: 499.5,
        items: [
          {
            item_id: "101",
            item_name: "Cotton tee",
            item_variant: "M / Blue",
            item_brand: "Local noodle",
            price: 499.5,
            quantity: 1,
          },
        ],
      },
    });
  });

  it("leave out Shopify's placeholder variant name", () => {
    const item = ga4AddToCart("INR", { ...tee, variant: "Default Title" }).params.items;
    expect(item).toEqual([expect.not.objectContaining({ item_variant: expect.anything() })]);
  });

  it("add up value as price times quantity, in cents", () => {
    const event = ga4BeginCheckout(
      "USD",
      [
        { ...tee, price: 10.1, quantity: 3 },
        { ...tee, productId: "gid://shopify/Product/102", price: 0.2, quantity: 1 },
      ],
      "POTLI",
    );
    expect(event.params).toMatchObject({ currency: "USD", value: 30.5, coupon: "POTLI" });
  });

  it("name a list by its collection", () => {
    const event = ga4ViewItemList({ id: "gid://shopify/Collection/7", name: "Shirts" }, [tee]);
    expect(event.params).toMatchObject({ item_list_id: "7", item_list_name: "Shirts" });
  });

  it("use Shopify's order number as the purchase's transaction id", () => {
    const event = ga4Purchase({
      orderId: "gid://shopify/Order/5551",
      currency: "INR",
      items: [{ ...tee, quantity: 2 }],
      shipping: 50,
      tax: 89.91,
    });
    expect(event).toMatchObject({
      name: "purchase",
      params: { transaction_id: "5551", value: 999, shipping: 50, tax: 89.91 },
    });
  });
});

describe("the merchant's google-services.json", () => {
  const file = (packages: string[]) =>
    JSON.stringify({
      project_info: { project_number: "123", project_id: "local-noodle" },
      client: packages.map((name, index) => ({
        client_info: {
          mobilesdk_app_id: `1:123:android:${index}`,
          android_client_info: { package_name: name },
        },
      })),
    });

  it("finds the App ID among every app the file lists", () => {
    const both = file(["com.other.app", "com.localnoodle.app"]);
    expect(checkGoogleServices(both, "com.localnoodle.app")).toEqual({
      ok: true,
      app: {
        projectId: "local-noodle",
        projectNumber: "123",
        firebaseAppId: "1:123:android:1",
        packageName: "com.localnoodle.app",
      },
    });
  });

  it("says which apps it's for when the App ID isn't one, matching case exactly", () => {
    expect(checkGoogleServices(file(["com.LocalNoodle.app"]), "com.localnoodle.app")).toEqual({
      ok: false,
      problem: "other-app",
      packages: ["com.LocalNoodle.app"],
    });
  });

  it("refuses files that aren't Firebase's", () => {
    expect(checkGoogleServices("{", "com.localnoodle.app")).toEqual({
      ok: false,
      problem: "not-json",
    });
    expect(checkGoogleServices('{"type":"service_account"}', "com.localnoodle.app")).toEqual({
      ok: false,
      problem: "not-google-services",
    });
  });
});
