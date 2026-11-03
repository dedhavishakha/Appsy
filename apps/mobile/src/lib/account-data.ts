import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ACCOUNT_KEY, useAccount } from "./account";
import {
  ADDRESS_DELETE_MUTATION,
  ADDRESS_UPDATE_MUTATION,
  ADDRESSES_QUERY,
  CUSTOMER_QUERY,
  CUSTOMER_UPDATE_MUTATION,
  ORDER_QUERY,
  ORDERS_QUERY,
  type AddressesData,
  type AddressInput,
  type Customer,
  type OrderDetail,
  type OrdersData,
  type OrderStatusFields,
  type UserErrors,
} from "./account-queries";

// The signed-in shopper's profile, orders and addresses, from the Customer Account API
// (lib/account-queries.ts), as in Seeaash. Nothing is kept once they sign out.

const ORDERS_PAGE = 20;

function checked(payload: UserErrors) {
  const problem = payload.userErrors[0]?.message;
  if (problem) throw new Error(problem);
}

export function useCustomer() {
  const { query, status } = useAccount();
  return useQuery({
    queryKey: [...ACCOUNT_KEY, "customer"],
    queryFn: () => query<{ customer: Customer }>(CUSTOMER_QUERY).then((data) => data.customer),
    enabled: status === "signedIn",
  });
}

export function useOrders() {
  const { query, status } = useAccount();
  return useInfiniteQuery({
    queryKey: [...ACCOUNT_KEY, "orders"],
    queryFn: ({ pageParam }) =>
      query<OrdersData>(ORDERS_QUERY, { first: ORDERS_PAGE, after: pageParam }).then(
        (data) => data.customer.orders,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null),
    enabled: status === "signedIn",
  });
}

export function useOrder(id: string) {
  const { query, status } = useAccount();
  return useQuery({
    queryKey: [...ACCOUNT_KEY, "order", id],
    queryFn: () => query<{ order: OrderDetail | null }>(ORDER_QUERY, { id }).then((data) => data.order),
    enabled: status === "signedIn" && id !== "",
  });
}

export function useAddresses() {
  const { query, status } = useAccount();
  return useQuery({
    queryKey: [...ACCOUNT_KEY, "addresses"],
    queryFn: () =>
      query<AddressesData>(ADDRESSES_QUERY).then(({ customer }) => ({
        defaultId: customer.defaultAddress?.id ?? null,
        addresses: customer.addresses.nodes,
      })),
    enabled: status === "signedIn",
  });
}

export function useAddressActions() {
  const { query } = useAccount();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...ACCOUNT_KEY, "addresses"] });

  const update = useMutation({
    mutationFn: async (input: { id: string; address?: AddressInput; isDefault?: boolean }) => {
      const data = await query<{ customerAddressUpdate: UserErrors }>(ADDRESS_UPDATE_MUTATION, {
        addressId: input.id,
        ...(input.address ? { address: input.address } : {}),
        ...(input.isDefault ? { defaultAddress: true } : {}),
      });
      checked(data.customerAddressUpdate);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const data = await query<{ customerAddressDelete: UserErrors }>(ADDRESS_DELETE_MUTATION, {
        addressId: id,
      });
      checked(data.customerAddressDelete);
    },
    onSuccess: refresh,
  });

  return { update, remove };
}

export function useProfileUpdate() {
  const { query } = useAccount();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { firstName: string; lastName: string }) => {
      const data = await query<{ customerUpdate: UserErrors }>(CUSTOMER_UPDATE_MUTATION, { input });
      checked(data.customerUpdate);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...ACCOUNT_KEY, "customer"] }),
  });
}

// Shopify's latest shipment statuses (FulfillmentEventStatus), as shoppers read them.
const SHIPMENT: Record<string, string> = {
  LABEL_PRINTED: "Preparing to ship",
  LABEL_PURCHASED: "Preparing to ship",
  CONFIRMED: "Shipped",
  CARRIER_PICKED_UP: "Shipped",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  ATTEMPTED_DELIVERY: "Delivery attempted",
  DELAYED: "Delayed",
  DELIVERED: "Delivered",
  FAILURE: "Delivery problem",
  READY_FOR_PICKUP: "Ready for pickup",
  PICKED_UP: "Picked up",
};

// Shopify's order fulfillment statuses (OrderFulfillmentStatus), likewise.
const FULFILLMENT: Record<string, string> = {
  FULFILLED: "Fulfilled",
  PARTIALLY_FULFILLED: "Partly fulfilled",
  IN_PROGRESS: "Being prepared",
  PENDING_FULFILLMENT: "Being prepared",
  ON_HOLD: "On hold",
  SCHEDULED: "Scheduled",
};

// One word or two for where an order is: cancelled or refunded, else the latest shipment's
// status once everything has gone, else how far fulfillment has got.
export function orderStatus(order: OrderStatusFields): string {
  if (order.cancelledAt) return "Cancelled";
  if (order.financialStatus === "REFUNDED") return "Refunded";
  const shipment = order.fulfillments.nodes[0]?.latestShipmentStatus;
  if (order.fulfillmentStatus === "FULFILLED" && shipment && SHIPMENT[shipment]) {
    return SHIPMENT[shipment];
  }
  const fulfillment = FULFILLMENT[order.fulfillmentStatus];
  if (fulfillment) return fulfillment;
  if (order.financialStatus === "PENDING") return "Payment pending";
  return "Confirmed";
}

// "12 Oct 2026", in the phone's language.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  try {
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
