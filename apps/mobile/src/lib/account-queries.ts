import type { Money } from "./format";

// Customer Account API operations for the Account tab, from Seeaash's, each checked against
// Shopify's 2026-07 schema with Shopify's validator (2026-11-02). Phones send them with the
// published file's API version (lib/customer-account).

export const CUSTOMER_QUERY = `
  query AppsyCustomer {
    customer {
      id
      firstName
      lastName
      displayName
      emailAddress { emailAddress }
      phoneNumber { phoneNumber }
    }
  }
`;

export type Customer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  emailAddress: { emailAddress: string | null } | null;
  phoneNumber: { phoneNumber: string | null } | null;
};

// Newest first; each with its latest shipment's status.
export const ORDERS_QUERY = `
  query AppsyOrders($first: Int!, $after: String) {
    customer {
      orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          processedAt
          financialStatus
          fulfillmentStatus
          cancelledAt
          totalPrice { amount currencyCode }
          fulfillments(first: 1, sortKey: CREATED_AT, reverse: true) {
            nodes { latestShipmentStatus }
          }
          lineItems(first: 3) { nodes { id title image { url altText } } }
        }
      }
    }
  }
`;

type Image = { url: string; altText: string | null } | null;

export type OrderStatusFields = {
  cancelledAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string;
  fulfillments: { nodes: { latestShipmentStatus: string | null }[] };
};

export type OrderSummary = OrderStatusFields & {
  id: string;
  name: string;
  processedAt: string;
  totalPrice: Money;
  lineItems: { nodes: { id: string; title: string; image: Image }[] };
};

export type OrdersData = {
  customer: {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: OrderSummary[];
    };
  };
};

export const ORDER_QUERY = `
  query AppsyOrder($id: ID!) {
    order(id: $id) {
      id
      name
      processedAt
      financialStatus
      fulfillmentStatus
      cancelledAt
      statusPageUrl
      subtotal { amount currencyCode }
      totalShipping { amount currencyCode }
      totalTax { amount currencyCode }
      totalPrice { amount currencyCode }
      shippingAddress { formatted(withName: true) }
      lineItems(first: 50) {
        nodes {
          id
          title
          variantTitle
          quantity
          image { url altText }
          totalPrice { amount currencyCode }
        }
      }
      fulfillments(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          latestShipmentStatus
          trackingInformation { number url company }
        }
      }
    }
  }
`;

export type OrderDetail = Omit<OrderStatusFields, "fulfillments"> & {
  id: string;
  name: string;
  processedAt: string;
  statusPageUrl: string;
  subtotal: Money | null;
  totalShipping: Money;
  totalTax: Money | null;
  totalPrice: Money;
  shippingAddress: { formatted: string[] } | null;
  lineItems: {
    nodes: {
      id: string;
      title: string;
      variantTitle: string | null;
      quantity: number;
      image: Image;
      totalPrice: Money | null;
    }[];
  };
  fulfillments: {
    nodes: {
      id: string;
      latestShipmentStatus: string | null;
      trackingInformation: { number: string | null; url: string | null; company: string | null }[];
    }[];
  };
};

export const ADDRESSES_QUERY = `
  query AppsyAddresses {
    customer {
      defaultAddress { id }
      addresses(first: 50) {
        nodes {
          id
          firstName
          lastName
          company
          address1
          address2
          city
          zoneCode
          territoryCode
          zip
          phoneNumber
          formatted(withName: true)
        }
      }
    }
  }
`;

export type CustomerAddress = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zoneCode: string | null;
  territoryCode: string | null;
  zip: string | null;
  phoneNumber: string | null;
  formatted: string[];
};

export type AddressesData = {
  customer: { defaultAddress: { id: string } | null; addresses: { nodes: CustomerAddress[] } };
};

// The fields of CustomerAddressInput the app sends.
export type AddressInput = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  zip: string;
  phoneNumber?: string;
  territoryCode?: string;
  zoneCode?: string;
};

export type UserErrors = { userErrors: { field?: string[] | null; message: string }[] };

export const ADDRESS_UPDATE_MUTATION = `
  mutation AppsyAddressUpdate($addressId: ID!, $address: CustomerAddressInput, $defaultAddress: Boolean) {
    customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) {
      customerAddress { id }
      userErrors { field message code }
    }
  }
`;

export const ADDRESS_DELETE_MUTATION = `
  mutation AppsyAddressDelete($addressId: ID!) {
    customerAddressDelete(addressId: $addressId) {
      deletedAddressId
      userErrors { field message code }
    }
  }
`;

export const CUSTOMER_UPDATE_MUTATION = `
  mutation AppsyCustomerUpdate($input: CustomerUpdateInput!) {
    customerUpdate(input: $input) {
      customer { id firstName lastName }
      userErrors { field message code }
    }
  }
`;
