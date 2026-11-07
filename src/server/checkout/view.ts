import type { Cart } from "../../lib/cart.ts";
import {
  emptyCheckoutAddress,
  type CheckoutAddress,
  type CheckoutView,
} from "../../lib/checkout.ts";
import type { StoreCart } from "../wordpress/store-transport.ts";

/* WooCommerce's cart answer as the checkout read model. Pure, so the mapping
   is tested against a recorded cart rather than a live store. */

type StoreAddress = NonNullable<StoreCart["billing_address"]>;

const fromStore = (address: StoreAddress | undefined): CheckoutAddress =>
  address
    ? {
        firstName: address.first_name,
        lastName: address.last_name,
        company: address.company,
        address1: address.address_1,
        address2: address.address_2,
        city: address.city,
        state: address.state,
        postcode: address.postcode,
        country: address.country,
        email: address.email,
        phone: address.phone,
      }
    : emptyCheckoutAddress;

const minor = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The checkout read model for one WooCommerce cart answer. Pure. */
export function toCheckoutView(store: StoreCart, cart: Cart): CheckoutView {
  return {
    cart,
    billing: fromStore(store.billing_address),
    shipping: fromStore(store.shipping_address),
    shippingOptions: store.shipping_rates.flatMap((pack) =>
      pack.shipping_rates.map((rate) => ({
        id: rate.rate_id,
        packageId: pack.package_id,
        name: rate.name,
        price: minor(rate.price),
        selected: rate.selected,
      })),
    ),
    coupons: store.coupons.map((coupon) => ({
      code: coupon.code,
      discount: minor(coupon.totals?.total_discount ?? "0"),
    })),
    needsShipping: store.needs_shipping,
    needsPayment: store.needs_payment,
  };
}
