import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishedSettings } from "@appsy/app-config";
import { useAnalytics, visitorConsent } from "./analytics";
import { useSettings } from "./app-settings";
import { useCountry } from "./country";
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

export function useCartActions() {
  const settings = useSettings();
  const { shop } = settings;
  const queryClient = useQueryClient();
  const { country } = useCountry();
  const { consent, track } = useAnalytics();

  const commit = async (payload: CartPayload) => {
    const problem = payload.userErrors[0]?.message;
    if (problem || !payload.cart) throw new Error(problem ?? "Your bag couldn't be updated.");
    await AsyncStorage.setItem(CART_ID_KEY, payload.cart.id);
    queryClient.setQueryData(CART_KEY, payload.cart);
    return payload.cart;
  };

  // A new cart for the shopper's country, credited to Appsy's channel (spike S2).
  const createCart = async (input: Record<string, unknown>) => {
    const { cartCreate } = await storefront<{ cartCreate: CartPayload }>(shop, CART_CREATE_MUTATION, {
      country,
      consent: visitorConsent(consent),
      input: {
        ...input,
        buyerIdentity: { countryCode: country },
        ...(shop.channelHandle ? { sourceName: `channel:${shop.channelHandle}` } : {}),
      },
    });
    return commit(cartCreate);
  };

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
    onSuccess: (_cart, variantId) => track("add_to_cart", { variantId, quantity: 1 }),
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

  // Adds a discount code to the bag, keeping the codes already there. Shopify says whether
  // the bag qualifies. From the bag's code box, a code that doesn't apply is taken back off
  // with a message; an Offer section keeps it (`keep`), so it applies once the bag
  // qualifies. Without a bag yet, it starts one holding the code.
  const applyCode = useMutation({
    mutationFn: async ({ code, keep = false }: { code: string; keep?: boolean }) => {
      const wanted = code.trim();
      if (!wanted) throw new Error("Enter a discount code.");
      const current = await queryClient.query({
        queryKey: CART_KEY,
        queryFn: () => loadCart(settings, country),
      });
      let cart: Cart;
      if (current) {
        const others = current.discountCodes.map((entry) => entry.code).filter((entry) => !sameCode(entry, wanted));
        const payload = await updateCodes(current.id, [...others, wanted]);
        cart = payload.cart ? await commit(payload) : await createCart({ discountCodes: [wanted] });
      } else {
        cart = await createCart({ discountCodes: [wanted] });
      }

      const applicable = cart.discountCodes.some((entry) => sameCode(entry.code, wanted) && entry.applicable);
      if (!applicable && !keep) {
        await commit(
          await updateCodes(
            cart.id,
            cart.discountCodes.map((entry) => entry.code).filter((entry) => !sameCode(entry, wanted)),
          ),
        );
        throw new Error(`“${wanted}” can't be used with what's in your bag.`);
      }
      return { cart, applicable };
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
  // and checkout follow that market.
  const moveToCountry = useMutation({
    mutationFn: async (code: string) => {
      const current = queryClient.getQueryData<Cart | null>(CART_KEY);
      if (!current) return null;
      const { cartBuyerIdentityUpdate } = await storefront<{ cartBuyerIdentityUpdate: CartPayload }>(
        shop,
        CART_BUYER_IDENTITY_MUTATION,
        { cartId: current.id, buyerIdentity: { countryCode: code }, country: code },
      );
      return commit(cartBuyerIdentityUpdate);
    },
  });

  return { add, setQuantity, applyCode, removeCode, moveToCountry };
}
