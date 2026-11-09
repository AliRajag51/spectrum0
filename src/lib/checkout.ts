/* The checkout, as the storefront sees it.
 *
 * WooCommerce still holds the basket and does every sum: the address decides
 * which shipping rates exist, the chosen rate and any coupon change the total,
 * and all of it comes back on the cart. These are read models and the inputs
 * that change them; nothing here prices anything. */

import { z } from "zod";
import type { Cart } from "./cart.ts";

export type CheckoutAddress = {
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

export const emptyCheckoutAddress: CheckoutAddress = {
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

export type ShippingOption = {
  id: string;
  packageId: number | string;
  name: string;
  /** Minor units, from WooCommerce. */
  price: number;
  selected: boolean;
};

export type AppliedCoupon = {
  code: string;
  /** Minor units. */
  discount: number;
};

export type CheckoutView = {
  cart: Cart;
  billing: CheckoutAddress;
  shipping: CheckoutAddress;
  shippingOptions: ShippingOption[];
  coupons: AppliedCoupon[];
  needsShipping: boolean;
  /** False only when WooCommerce says nothing is owed, a fully discounted basket. */
  needsPayment: boolean;
};

const text = (max: number) => z.string().trim().max(max);

export const checkoutAddressInput = z.object({
  firstName: text(80),
  lastName: text(80),
  company: text(120),
  address1: text(200),
  address2: text(200),
  city: text(120),
  state: text(120),
  postcode: text(40),
  country: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/),
  // Checked for shape when it is complete; while the customer is still typing
  // the address is pushed without it, so an empty value is allowed here.
  email: z.union([z.literal(""), z.string().trim().max(320).email()]),
  phone: text(40),
});

export const updateAddressInput = z.object({
  billing: checkoutAddressInput,
  /** Null: ship to the billing address, as the unticked box says. */
  shipping: checkoutAddressInput.nullable(),
});

export const shippingRateInput = z.object({
  packageId: z.union([z.number().int().nonnegative(), z.string().min(1).max(40)]),
  rateId: z.string().min(1).max(100),
});

export const couponInput = z.object({
  code: z.string().trim().min(1).max(60),
});

type AddressField = keyof CheckoutAddress;

/**
 * Fields the customer still has to fill before the order can be placed.
 *
 * The same required set the WooCommerce checkout marks with an asterisk. A
 * state is only required where the country has a state list, and email only
 * on the billing address. WooCommerce checks again when the order is created;
 * this is so the customer is told before they press the button.
 */
export function missingAddressFields(
  address: CheckoutAddress,
  { billing, hasStates }: { billing: boolean; hasStates: boolean },
): AddressField[] {
  const required: AddressField[] = ["firstName", "lastName", "country", "address1", "city", "postcode"];
  if (hasStates) required.push("state");
  if (billing) required.push("email");
  return required.filter((field) => !address[field].trim());
}

/** The selected rate, or the first one when WooCommerce has not picked yet. */
export function selectedShipping(options: ShippingOption[]): ShippingOption | null {
  return options.find((option) => option.selected) ?? options[0] ?? null;
}

/** An order total as WooCommerce writes it ("163.99") in minor units. Every store currency here has two decimals. */
export const orderMinorUnits = (total: string) => Math.round(Number(total) * 100);

/** "2.5.0" against [2, 5, 0]: whether the installed release is at least that one. */
export function versionAtLeast(version: string, minimum: number[]) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < minimum.length; i++) {
    if ((parts[i] ?? 0) !== minimum[i]) return (parts[i] ?? 0) > minimum[i];
  }
  return true;
}

/** Whether a WooCommerce address is the real, live store rather than the dev clone. */
export function isLiveStore(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /^(?:www\.)?spectrumbiosciences\.shop$/i.test(new URL(url).hostname);
  } catch {
    // An address that cannot be read is treated as live: test mode stays off.
    return true;
  }
}

/* Sandbox decline simulation.
 *
 * Tagada's sandbox approves every card, so a declined payment cannot be
 * produced there. In test mode only, Stripe's own test card for insufficient
 * funds (4000 0000 0000 9995) is declined instead, so the checkout's decline
 * path can be tried end to end. It is read from the token's non-sensitive
 * section (first six and last four digits); the card number itself never
 * reaches the server. */
export type SimulatedDecline = "insufficient_funds";

export function simulatedDecline(tagadaToken: string): SimulatedDecline | null {
  try {
    const decoded = JSON.parse(atob(tagadaToken)) as {
      nonSensitiveMetadata?: { last4?: unknown; bin?: unknown };
    };
    const meta = decoded.nonSensitiveMetadata;
    const last4 = typeof meta?.last4 === "string" ? meta.last4 : "";
    const bin = typeof meta?.bin === "string" ? meta.bin : "";
    if (last4 === "9995" && (!bin || bin.startsWith("400000"))) return "insufficient_funds";
  } catch {
    // Not a readable token: nothing to simulate.
  }
  return null;
}

/** The decline message for a processor's reason, in the customer's terms. */
export function declineMessage(reason: string | null | undefined): string {
  if (reason && /insufficient/i.test(reason)) {
    return "Your card was declined because of insufficient funds. Please use another card.";
  }
  return "Your card was declined. Please check the details or try another card.";
}

/** Session key for begin_checkout: the basket's lines and quantities, never its total. */
export function beginCheckoutKey(lines: { key: string; quantity: number }[]): string {
  return "pc_bc:" + [...lines].map((line) => `${line.key}:${line.quantity}`).sort().join("|");
}
