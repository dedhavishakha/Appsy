import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FEATURE,
  ACCOUNT_SCHEME,
  accountCallbackUrl,
  accountClientId,
  accountDeletionInput,
  accountScheme,
  createDefaultDesign,
  customerAccountClientId,
  erasedBy,
  savedAccountSettings,
  setAccountClientId,
  shopNumber,
  switchFeature,
} from "./index";

const CLIENT_ID = "8c0e2f6a-1b2c-4d3e-9f40-5a6b7c8d9e0f";

describe("shopper accounts", () => {
  it("sign in with the store's client only while accounts are on", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    expect(accountClientId(design)).toBeNull();

    const saved = setAccountClientId(design, CLIENT_ID);
    expect(accountClientId(saved)).toBeNull();
    expect(savedAccountSettings(saved)).toEqual({ clientId: CLIENT_ID });

    const on = switchFeature(saved, ACCOUNT_FEATURE, true);
    expect(accountClientId(on)).toBe(CLIENT_ID);
    expect(on.navigation.tabs).toContain("account");

    const off = switchFeature(on, ACCOUNT_FEATURE, false);
    expect(accountClientId(off)).toBeNull();
    expect(off.navigation.tabs).not.toContain("account");
    expect(savedAccountSettings(off)).toEqual({ clientId: CLIENT_ID });
  });

  it("keep the switch when the client ID changes", () => {
    const on = switchFeature(
      setAccountClientId(createDefaultDesign({ defaultCountry: "IN" }), CLIENT_ID),
      ACCOUNT_FEATURE,
      true,
    );
    expect(accountClientId(setAccountClientId(on, "shp_new-client"))).toBe("shp_new-client");
  });

  it("take a pasted client ID with spaces around it, and refuse what can't be one", () => {
    expect(customerAccountClientId.parse(`  ${CLIENT_ID}\n`)).toBe(CLIENT_ID);
    expect(customerAccountClientId.safeParse("").success).toBe(false);
    expect(customerAccountClientId.safeParse("short").success).toBe(false);
    expect(customerAccountClientId.safeParse("has spaces in it").success).toBe(false);
    expect(customerAccountClientId.safeParse("https://shopify.com/123").success).toBe(false);
  });

  it("ignore a saved client ID that isn't valid", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    const feature = { enabled: true, settings: { clientId: "no" } };
    const broken = { ...design, features: { ...design.features, [ACCOUNT_FEATURE]: feature } };
    expect(accountClientId(broken)).toBeNull();
  });

  it("say when Shopify erases an account, and take only an install ID with the request", () => {
    expect(erasedBy(new Date("2026-11-02T10:00:00Z")).toISOString()).toBe(
      "2026-11-12T10:00:00.000Z",
    );
    expect(accountDeletionInput.safeParse({}).success).toBe(true);
    expect(accountDeletionInput.safeParse({ installId: CLIENT_ID }).success).toBe(true);
    expect(accountDeletionInput.safeParse({ installId: "phone-1" }).success).toBe(false);
  });

  // Shopify: mobile callback URLs use the scheme shop.{shop_id}.*
  it("make the callback URL from the store's Shopify ID", () => {
    const shopId = shopNumber("gid://shopify/Shop/81776902385");
    expect(shopId).toBe("81776902385");
    expect(accountScheme("81776902385")).toBe("shop.81776902385.appsy");
    expect(accountCallbackUrl("81776902385")).toBe("shop.81776902385.appsy://callback");
    expect(ACCOUNT_SCHEME.exec("shop.81776902385.appsy")?.[1]).toBe("81776902385");
    expect(ACCOUNT_SCHEME.test("appsy")).toBe(false);
    expect(shopNumber("gid://shopify/Customer/1")).toBeNull();
  });
});
