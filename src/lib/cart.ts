/* The cart, as every storefront surface sees it.
 *
 * After the Store API migration WooCommerce owns the basket and its arithmetic,
 * so these are read models: money arrives already totalled, in minor units, and
 * nothing here recomputes it. The one thing the storefront still derives is the
 * pre-add preview on a product page, where there is no cart line yet.
 *
 * `quantity` is vials, the one number WooCommerce knows. The Bundle & Save
 * tier is a function of it - four vials earn the three-vial rate - and comes
 * back on the line's `tpc` extension as the percentage applied and the saving.
 * There is no second dimension: one strength is one line, and adding it again
 * grows that line. */

import { bundleUnitMinor, discountFor, type BundleTier } from "./bundle-tiers.ts";
import type { Product, Variation } from "./types.ts";

export type CartLine = {
  /** WooCommerce's cart item key. Opaque, and the handle for every mutation. */
  key: string;
  productId: string;
  variationId: string;
  /** Vials. What WooCommerce stores, and what the tier is decided from. */
  quantity: number;
  name: string;
  strength: string;
  image: string;
  lot?: string;
  /** Minor units, from WooCommerce. */
  unitPrice: number;
  regularUnitPrice: number;
  lineTotal: number;
  discountPercent: number;
  /** Exact bundle-only saving from the WooCommerce extension, in minor units. */
  bundleSavings?: number;
};

export type Cart = {
  lines: CartLine[];
  /** Minor units. */
  subtotal: number;
  total: number;
  totalShipping: number;
  totalDiscount: number;
  currency: string;
  /** Total vials, which is what the header badge counts. */
  itemCount: number;
  needsShipping: boolean;
  /** Coupons WooCommerce applied, each with its discount in minor units. */
  coupons: { code: string; discount: number }[];
};

export const emptyCart: Cart = {
  lines: [],
  subtotal: 0,
  total: 0,
  totalShipping: 0,
  totalDiscount: 0,
  currency: "USD",
  itemCount: 0,
  needsShipping: false,
  coupons: [],
};

/** Minor units to the display string every surface already uses. */
export function cartMoney(minor: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      minor / 100,
    );
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/**
 * The preview price for a selection that is not in the cart yet.
 *
 * Rounds the unit first and then multiplies, because that is the order
 * WooCommerce applies: the site plugin sets a discounted unit price and
 * WooCommerce multiplies it by the quantity. Computing the whole line and
 * rounding once at the end drifts a cent on some prices, and a product page
 * that quotes a cent more than the basket is worse than either number.
 */
export function previewLineTotal(unitMinor: number, quantity: number, percent: number) {
  return bundleUnitMinor(unitMinor, percent) * quantity;
}

/* The provisional cart: what the drawer shows between the click and
 * WooCommerce's answer.
 *
 * Built from the catalogue the page already holds and the same tier discounts
 * the product page quotes from, so the line that appears on the click is the
 * line WooCommerce will confirm, to the cent. Totals are marked pending by the
 * caller: shipping and tax are WooCommerce's, and a provisional subtotal only
 * says what the lines add up to. Every field here is replaced by the server's
 * cart on the answer. */

/** A key WooCommerce would never issue, so a pending line is recognisable. */
export const provisionalKey = (productId: string, variationId: string) =>
  `pending:${productId}:${variationId}`;

function retotal(cart: Cart, lines: CartLine[]): Cart {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    ...cart,
    lines,
    subtotal,
    total: subtotal + cart.totalShipping,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * The cart with a selection added, the way WooCommerce will add it.
 *
 * Adding a strength already in the cart grows that line, which is how
 * WooCommerce merges a repeat of the same item. The tier is re-read from the
 * new quantity, so two singles added one after the other become a pair at the
 * pair's rate - the same thing the site will say.
 */
export function withProvisionalLine(
  cart: Cart,
  product: Product,
  variation: Variation,
  quantity: number,
  tiers: BundleTier[],
): Cart {
  if (variation.price === null) return cart;
  const existing = cart.lines.find(
    (line) => line.productId === product.id && line.variationId === variation.id,
  );
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  const percent = discountFor(tiers, nextQuantity);
  const regularUnitPrice = Math.round(variation.price * 100);
  const unitPrice = bundleUnitMinor(regularUnitPrice, percent);
  const line: CartLine = {
    key: existing?.key ?? provisionalKey(product.id, variation.id),
    productId: product.id,
    variationId: variation.id,
    quantity: nextQuantity,
    name: product.name,
    strength: variation.strength,
    image: product.image,
    lot: variation.lot,
    unitPrice,
    regularUnitPrice,
    lineTotal: unitPrice * nextQuantity,
    discountPercent: percent,
    bundleSavings: percent > 0 ? (regularUnitPrice - unitPrice) * nextQuantity : undefined,
  };
  const lines = existing
    ? cart.lines.map((candidate) => (candidate === existing ? line : candidate))
    : [...cart.lines, line];
  return retotal(cart, lines);
}

/**
 * The cart with one line at a new quantity; zero takes the line out.
 *
 * The tier moves with the quantity, so stepping a pair up to three re-prices
 * the line at the three-vial rate before WooCommerce confirms it, and stepping
 * it down to one takes the saving away the same instant.
 */
export function withLineQuantity(
  cart: Cart,
  key: string,
  quantity: number,
  tiers: BundleTier[],
): Cart {
  if (quantity <= 0) {
    return retotal(cart, cart.lines.filter((line) => line.key !== key));
  }
  const lines = cart.lines.map((line) => {
    if (line.key !== key) return line;
    const percent = discountFor(tiers, quantity);
    const unitPrice = bundleUnitMinor(line.regularUnitPrice, percent);
    return {
      ...line,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      discountPercent: percent,
      bundleSavings: percent > 0 ? (line.regularUnitPrice - unitPrice) * quantity : undefined,
    };
  });
  return retotal(cart, lines);
}
