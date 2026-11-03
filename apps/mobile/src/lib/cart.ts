import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appCodeStart,
  ga4AddToCart,
  withCodeStart,
  withoutCodeStart,
  type PublishedSettings,
} from "@appsy/app-config";
import { useAccount } from "./account";
import { ga4Line, useAnalytics, visitorConsent } from "./analytics";
import { useSettings } from "./app-settings";
import { useCountry } from "./country";
import { usePush } from "./push";
import {
  CART_BUYER_IDENTITY_MUTATION,
  CART_CREATE_MUTATION,
  CART_DISCOUNT_CODES_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_REMOVE_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_QUERY,
  type Cart,
  type CartPayload,
} from "./queries";
import { storefront } from "./storefront";

// The cart lives on Shopify; the app only remembers its id (as in Seeaash). Every change
// writes the returned cart into the query cache, so all screens update at once.
const CART_ID_KEY = "appsy.cartId";
export const CART_KEY = ["cart"] as const;

async function loadCart(settings: PublishedSettings, country: string): Promise<Cart | null> {
  const id = await AsyncStorage.getItem(CART_ID_KEY);
  if (!id) return null;
  const { cart } = await storefront<{ cart: Cart | null }>(settings.shop, CART_QUERY, { id, country });
  // Shopify ends a cart after checkout, or after about 10 days without activity.
  if (!cart) await AsyncStorage.removeItem(CART_ID_KEY);
  return cart;
}

export function useCart() {
  const settings = useSettings();
  const { country } = useCountry();
  return useQuery({ queryKey: CART_KEY, queryFn: () => loadCart(settings, country) });
}

// Discount codes are case-insensitive.
const sameCode = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The store's code start while app-only discount codes are on (app-config app-codes.ts):
// the app adds it to the codes shoppers type, and leaves it out wherever it shows a code.
export function useCodeStart(): string | null {
  return appCodeStart(useSettings());
}

// Shopify refused the signed-in shopper's token (it ended): the bag carries on as a guest's.
const refusesToken = (payload: CartPayload) =>
  payload.userErrors.some((error) => error.field?.includes("customerAccessToken"));

// What every change to the bag shares: saving the cart Shopify returns, starting a new cart,
// and saying who the bag belongs to.
function useCartWriter() {
  const settings = useSettings();
  const { shop } = settings;
  const queryClient = useQueryClient();
  const { country } = useCountry();
  const { consent } = useAnalytics();

  const commit = async (payload: CartPayload) => {
    const problem = payload.userErrors[0]?.message;
    if (problem || !payload.cart) throw new Error(problem ?? "Your bag couldn't be updated.");
    await AsyncStorage.setItem(CART_ID_KEY, payload.cart.id);
    queryClient.setQueryData(CART_KEY, payload.cart);
    return payload.cart;
  };

  // A new cart for the shopper's country, credited to Appsy's channel (spike S2), and theirs
  // when they're signed in (`token`). A token Shopify refuses doesn't stop the bag.
  const startCart = async (input: Record<string, unknown>, token: string | null = null) => {
    const create = async (customerAccessToken: string | null) => {
      const { cartCreate } = await storefront<{ cartCreate: CartPayload }>(
        shop,
        CART_CREATE_MUTATION,
        {
          country,
          consent: visitorConsent(consent),
          input: {
            ...input,
            buyerIdentity: {
              countryCode: country,
              ...(customerAccessToken ? { customerAccessToken } : {}),
            },
            ...(shop.channelHandle ? { sourceName: `channel:${shop.channelHandle}` } : {}),
          },
        },
      );
      return cartCreate;
    };
    const payload = await create(token);
    return token && refusesToken(payload) ? create(null) : payload;
  };

  // Sets the bag's buyer: the shopper's country, and their token while signed in.
  const setBuyer = async (cartId: string, token: string | null) => {
    const { cartBuyerIdentityUpdate } = await storefront<{ cartBuyerIdentityUpdate: CartPayload }>(
      shop,
      CART_BUYER_IDENTITY_MUTATION,
      {
        cartId,
        buyerIdentity: { countryCode: country, ...(token ? { customerAccessToken: token } : {}) },
        country,
      },
    );
    return cartBuyerIdentityUpdate;
  };

  return { settings, shop, country, queryClient, commit, startCart, setBuyer };
}

// The bag when the shopper signs in or out (components/account-provider.tsx). Signing in
// makes it theirs, with their prices and discounts. Signing out moves its items and codes to a
// new bag of no one's: Shopify asks apps to clear signed-in bags on sign-out (Checkout Kit's
// guide, https://shopify.dev/docs/storefronts/mobile/checkout-kit/authenticate-checkouts).
export function useBagOwner() {
  const { settings, country, queryClient, commit, startCart, setBuyer } = useCartWriter();

  const attach = async (token: string) => {
    const cartId = await AsyncStorage.getItem(CART_ID_KEY);
    if (!cartId) return;
    const payload = await setBuyer(cartId, token);
    if (payload.cart && !refusesToken(payload)) await commit(payload);
  };

  const detach = async () => {
    const current = await queryClient.query({
      queryKey: CART_KEY,
      queryFn: () => loadCart(settings, country),
    });
    await AsyncStorage.removeItem(CART_ID_KEY);
    queryClient.setQueryData(CART_KEY, null);
    const lines = (current?.lines.nodes ?? []).map((line) => ({
      merchandiseId: line.merchandise.id,
      quantity: line.quantity,
    }));
    if (!current || lines.length === 0) return;
    await commit(
      await startCart({ lines, discountCodes: current.discountCodes.map((entry) => entry.code) }),
    );
  };

  return { attach, detach };
}

export function useCartActions() {
  const { settings, shop, country, queryClient, commit, startCart, setBuyer } = useCartWriter();
  const start = appCodeStart(settings);
  const { track, trackGa4 } = useAnalytics();
  const { afterAddToBag } = usePush();
  const account = useAccount();

  const createCart = async (input: Record<string, unknown>) =>
    commit(await startCart(input, await account.accessToken()));

  const updateCodes = (cartId: string, discountCodes: string[]) =>
    storefront<{ cartDiscountCodesUpdate: CartPayload }>(shop, CART_DISCOUNT_CODES_MUTATION, {
      cartId,
      discountCodes,
      country,
    }).then(({ cartDiscountCodesUpdate }) => cartDiscountCodesUpdate);

  const add = useMutation({
    mutationFn: async (variantId: string) => {
      const lines = [{ merchandiseId: variantId, quantity: 1 }];
      const cartId = await AsyncStorage.getItem(CART_ID_KEY);
      if (cartId) {
        const { cartLinesAdd } = await storefront<{ cartLinesAdd: CartPayload }>(
          shop,
          CART_LINES_ADD_MUTATION,
          { cartId, lines, country },
        );
        if (cartLinesAdd.cart) return commit(cartLinesAdd);
        // The saved cart has ended (checked out or expired), so start a new one.
      }
      return createCart({ lines });
    },
    onSuccess: (cart, variantId) => {
      track("add_to_cart", { variantId, quantity: 1 });
      // Google Analytics gets the one added, at the bag's price for one.
      const line = cart.lines.nodes.find((entry) => entry.merchandise.id === variantId);
      if (line) {
        const price = line.cost.amountPerQuantity;
        trackGa4(ga4AddToCart(price.currencyCode, { ...ga4Line(line), quantity: 1 }));
      }
      // The first time, the app asks about notifications (offers and bag reminders).
      afterAddToBag();
    },
  });

  const setQuantity = useMutation({
    mutationFn: async ({ lineId, quantity }: { lineId: string; quantity: number }) => {
      const cartId = await AsyncStorage.getItem(CART_ID_KEY);
      if (!cartId) throw new Error("Your bag has expired. Please add the items again.");
      if (quantity <= 0) {
        const { cartLinesRemove } = await storefront<{ cartLinesRemove: CartPayload }>(
          shop,
          CART_LINES_REMOVE_MUTATION,
          { cartId, lineIds: [lineId], country },
        );
        return commit(cartLinesRemove);
      }
      const { cartLinesUpdate } = await storefront<{ cartLinesUpdate: CartPayload }>(
        shop,
        CART_LINES_UPDATE_MUTATION,
        { cartId, lines: [{ id: lineId, quantity }], country },
      );
      return commit(cartLinesUpdate);
    },
  });

  // Sets the bag's codes to the ones already there, apart from `tries`, plus `wanted` (null
  // takes them off). Without a bag, or once it has ended, it starts one holding `wanted`.
  // `missing`: Shopify has no such code.
  const putCode = async (cart: Cart | null, tries: string[], wanted: string | null) => {
    const others = (cart?.discountCodes ?? [])
      .map((entry) => entry.code)
      .filter((entry) => !tries.some((code) => sameCode(code, entry)));
    const updated = cart ? await updateCodes(cart.id, wanted ? [...others, wanted] : others) : null;
    const payload = updated?.cart
      ? updated
      : await startCart({ discountCodes: wanted ? [wanted] : [] }, await account.accessToken());
    const missing = payload.warnings?.some((warning) => warning.code === "DISCOUNT_NOT_FOUND") ?? false;
    return { cart: await commit(payload), missing };
  };

  // Adds a discount code to the bag, keeping the codes already there. Shopify says whether
  // the bag qualifies. With app-only codes on, the app tries the code with the store's code
  // start first, then as typed. From the bag's code box, a code that doesn't apply is taken
  // back off with a message; an Offer section keeps it (`keep`), so it applies once the bag
  // qualifies. A code Shopify doesn't know is never kept.
  const applyCode = useMutation({
    mutationFn: async ({ code, keep = false }: { code: string; keep?: boolean }) => {
      const typed = code.trim();
      if (!typed) throw new Error("Enter a discount code.");
      const tries = (start ? [withCodeStart(typed, start), typed] : [typed]).filter(
        (entry, index, all) => all.findIndex((other) => sameCode(other, entry)) === index,
      );
      let cart = await queryClient.query({
        queryKey: CART_KEY,
        queryFn: () => loadCart(settings, country),
      });
      const known: string[] = [];
      for (const wanted of tries) {
        const result = await putCode(cart, tries, wanted);
        cart = result.cart;
        if (cart.discountCodes.some((entry) => sameCode(entry.code, wanted) && entry.applicable)) {
          return { cart, applicable: true };
        }
        if (!result.missing) known.push(wanted);
      }
      if (!cart) throw new Error("Your bag couldn't be updated.");

      // None applies yet. An Offer keeps the one Shopify knows, the app-only code first.
      const kept = keep ? known[0] : undefined;
      if (kept && kept === tries[tries.length - 1]) return { cart, applicable: false };
      cart = (await putCode(cart, tries, kept ?? null)).cart;
      if (kept) return { cart, applicable: false };
      const shown = withoutCodeStart(typed, start);
      throw new Error(
        known.length > 0
          ? `“${shown}” can't be used with what's in your bag.`
          : `“${shown}” isn't a valid discount code.`,
      );
    },
  });

  const removeCode = useMutation({
    mutationFn: async (code: string) => {
      const current = queryClient.getQueryData<Cart | null>(CART_KEY);
      if (!current) return null;
      return commit(
        await updateCodes(
          current.id,
          current.discountCodes.map((entry) => entry.code).filter((entry) => !sameCode(entry, code)),
        ),
      );
    },
  });

  // After the shopper picks another country: the bag moves there, so its prices, currency
  // and checkout follow that market. A signed-in shopper's bag stays theirs.
  const moveToCountry = useMutation({
    mutationFn: async (code: string) => {
      const current = queryClient.getQueryData<Cart | null>(CART_KEY);
      if (!current) return null;
      const move = async (token: string | null) => {
        const { cartBuyerIdentityUpdate } = await storefront<{
          cartBuyerIdentityUpdate: CartPayload;
        }>(shop, CART_BUYER_IDENTITY_MUTATION, {
          cartId: current.id,
          buyerIdentity: { countryCode: code, ...(token ? { customerAccessToken: token } : {}) },
          country: code,
        });
        return cartBuyerIdentityUpdate;
      };
      const token = await account.accessToken();
      const payload = await move(token);
      return commit(token && refusesToken(payload) ? await move(null) : payload);
    },
  });

  // The bag as it goes to checkout. A signed-in shopper's bag first gets their current token:
  // Shopify's signed-in checkout addresses expire, an expired one checks out as a guest, and a
  // renewed token goes on the bag again (Checkout Kit's and the Customer Account API's
  // checkout guides). The bag Shopify returns has a fresh address, used at once.
  const forCheckout = async (cart: Cart): Promise<Cart> => {
    const token = await account.accessToken();
    if (!token) return cart;
    try {
      const payload = await setBuyer(cart.id, token);
      return payload.cart && !refusesToken(payload) ? await commit(payload) : cart;
    } catch {
      return cart;
    }
  };

  return { add, setQuantity, applyCode, removeCode, moveToCountry, forCheckout };
}
