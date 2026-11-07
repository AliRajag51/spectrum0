import "server-only";

import type { z } from "zod";
import type { Cart } from "@/lib/cart";
import type { CartJar } from "@/lib/cart-jar";
import {
  emptyCheckoutAddress,
  type CheckoutAddress,
  type CheckoutView,
  type couponInput,
  type shippingRateInput,
  type updateAddressInput,
} from "@/lib/checkout";
import { emptyCart } from "@/lib/cart";
import { getCatalog } from "@/server/catalog";
import { settle, toCart } from "@/server/cart/service";
import { toCheckoutView } from "@/server/checkout/view";
import { CustomerFacingError } from "@/server/errors";
import { CartError } from "@/server/cart/service";
import {
  BUSY_MESSAGE,
  SESSION_MESSAGE,
  cartRequest,
  checkoutRequest,
  type PlacedOrder,
  type StoreOutcome,
} from "@/server/wordpress/store-api";
import { orderDeclarationExtension, type OrderDeclaration } from "@/lib/research-declaration";

/* The checkout, as a domain service over the same WooCommerce cart.
 *
 * Nothing is priced here. The address goes to WooCommerce, which answers with
 * the shipping rates that address has; the chosen rate and any coupon go the
 * same way, and the totals the customer sees are WooCommerce's. Every call
 * answers with the whole recalculated checkout, for the same reason the cart
 * does: a change to one part moves the total. */

export type CheckoutResult = { cart: Cart; jar: CartJar | null; view: CheckoutView };

const toStore = (address: CheckoutAddress, withEmail: boolean) => ({
  first_name: address.firstName,
  last_name: address.lastName,
  company: address.company,
  address_1: address.address1,
  address_2: address.address2,
  city: address.city,
  state: address.state,
  postcode: address.postcode,
  country: address.country,
  phone: address.phone,
  ...(withEmail ? { email: address.email } : {}),
});

async function respond(result: StoreOutcome): Promise<CheckoutResult> {
  const settled = settle(result);
  const cart = toCart(settled.cart, await getCatalog());
  return { cart, jar: settled.jar, view: toCheckoutView(settled.cart, cart) };
}

const emptyView: CheckoutView = {
  cart: emptyCart,
  billing: emptyCheckoutAddress,
  shipping: emptyCheckoutAddress,
  shippingOptions: [],
  coupons: [],
  needsShipping: false,
  needsPayment: false,
};

export async function readCheckout(jar: CartJar | null): Promise<CheckoutResult> {
  if (!jar) return { cart: emptyCart, jar: null, view: emptyView };
  return respond(await cartRequest(jar, { route: "cart" }));
}

/**
 * Tell WooCommerce where the order is going, which is what decides the
 * shipping rates. Shipping to the billing address sends it twice, so
 * WooCommerce never prices against a stale second address.
 */
export async function updateAddress(
  jar: CartJar | null,
  input: z.infer<typeof updateAddressInput>,
): Promise<CheckoutResult> {
  if (!jar) return { cart: emptyCart, jar: null, view: emptyView };
  return respond(
    await cartRequest(jar, {
      route: "cart/update-customer",
      body: {
        billing_address: toStore(input.billing, true),
        shipping_address: toStore(input.shipping ?? input.billing, false),
      },
    }),
  );
}

export async function selectShippingRate(
  jar: CartJar | null,
  input: z.infer<typeof shippingRateInput>,
): Promise<CheckoutResult> {
  if (!jar) return { cart: emptyCart, jar: null, view: emptyView };
  return respond(
    await cartRequest(jar, {
      route: "cart/select-shipping-rate",
      body: { package_id: input.packageId, rate_id: input.rateId },
    }),
  );
}

export async function applyCoupon(
  jar: CartJar | null,
  input: z.infer<typeof couponInput>,
): Promise<CheckoutResult> {
  if (!jar) return { cart: emptyCart, jar: null, view: emptyView };
  return respond(await cartRequest(jar, { route: "cart/apply-coupon", body: { code: input.code } }));
}

export async function removeCoupon(
  jar: CartJar | null,
  input: z.infer<typeof couponInput>,
): Promise<CheckoutResult> {
  if (!jar) return { cart: emptyCart, jar: null, view: emptyView };
  return respond(await cartRequest(jar, { route: "cart/remove-coupon", body: { code: input.code } }));
}

