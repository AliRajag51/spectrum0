/* View models shared by the account server services and the account UI.

   Deliberately camelCase and free of WordPress vocabulary: the bridge's
   snake_case payloads are mapped once, in the service, so no component has to
   know how WooCommerce spells a field. */

import type { ResearchStatus } from "./research-declaration";

export type Viewer = {
  id: number;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  /** Their stored answer to the checkout's marketing box; null when never answered. */
  marketingOptIn?: boolean | null;
  /** The OpenAI pixel's hashed match values from WordPress (task 9); never shown, never logged. */
  openaiMatch?: { email_sha256: string; external_id_sha256?: string } | null;
  /** The WELCOME30 offer as WordPress sees it for this account (task 20). */
  welcome30?: WelcomeState | null;
  /** The order declaration WordPress already holds for this account, when it owes
      no new one: checkout skips its research step and sends this (the agency, Oct 16). */
  researchOnFile?: { purpose: ResearchStatus } | null;
  /** Whether the account still owes the research step; false only when WordPress says so. */
  declarationOwed?: boolean;
};

export type WelcomeState = {
  code: string;
  state: "none" | "viewed" | "claimed" | "dismissed" | "removed";
  views: number;
  /** Show the sheet (eligible, and not yet viewed twice). The storefront adds its page rules. */
  show: boolean;
  /** Apply the code to a cart with items and no coupon (the "sticky apply"). */
  apply: boolean;
};

export type OrderItemSummary = { name: string; quantity: number };

export type AccountOrder = {
  id: number;
  number: string;
  date: string | null;
  status: string;
  statusLabel: string;
  total: string;
  currency: string;
  itemCount: number;
  items: OrderItemSummary[];
};

export type AccountOrderLine = {
  id: number;
  name: string;
  quantity: number;
  sku: string;
  total: string;
  subtotal: string;
  image: string;
  slug: string;
};

export type AccountOrderTotal = { label: string; value: string };

export type AccountAddress = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
};

export type AccountOrderDetail = AccountOrder & {
  paymentMethodTitle: string;
  datePaid: string | null;
  dateCompleted: string | null;
  customerNote: string;
  needsPayment: boolean;
  billing: AccountAddress;
  shipping: AccountAddress;
  lines: AccountOrderLine[];
  totals: AccountOrderTotal[];
};

export type AccountAddressBook = {
  billing: AccountAddress;
  shipping: AccountAddress;
  countries: Record<string, string>;
  billingStates: Record<string, string>;
  shippingStates: Record<string, string>;
};

export const emptyAddress: AccountAddress = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  email: "",
  phone: "",
};

export const addressKinds = ["billing", "shipping"] as const;
export type AddressKind = (typeof addressKinds)[number];

export function customerName(viewer: Pick<Viewer, "firstName" | "lastName" | "displayName" | "email">) {
  const full = `${viewer.firstName} ${viewer.lastName}`.trim();
  return full || viewer.displayName || viewer.email;
}

/**
 * A post-sign-in destination that is safe to redirect to.
 *
 * The value reaches the page as a query parameter, so it has to be a plain
 * path on this storefront: a protocol-relative `//host`, a backslash variant
 * or an absolute URL would turn the sign-in form into an open redirect.
 */
export function safeAccountRedirect(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  return path && /^\/(?!\/)[\w\-/?=&.%]*$/.test(path) ? path : "/account";
}

/* WooCommerce sends money as a decimal string and dates as full ISO 8601, so
   neither can go through the catalogue helpers, which take numbers and plain
   dates. Formatting stays here to keep every account surface consistent. */

/* The store is US-only, so the currency never changes with locale - only the
   words around it do (Spanish keeps USD, formatted the Spanish way). */
function intlLocale(locale: string) {
  return locale === "es" ? "es-US" : "en-US";
}

export function orderMoney(amount: string, currency = "USD", locale = "en") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(
      value,
    );
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function orderDate(value: string | null, locale = "en") {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(intlLocale(locale), {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** Order statuses the storefront gives its own wording and colour to. */
export const orderStatusTone: Record<string, "pending" | "active" | "done" | "closed"> = {
  pending: "pending",
  "on-hold": "pending",
  failed: "closed",
  processing: "active",
  completed: "done",
  cancelled: "closed",
  refunded: "closed",
};
