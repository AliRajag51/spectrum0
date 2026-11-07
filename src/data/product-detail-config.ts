/* Pack options on the product page and Quick View.
 *
 * A pack is a quantity preset: choosing "5 Bottles" adds five bottles to the
 * WooCommerce cart. Any Bundle & Save discount is applied by WooCommerce from
 * that quantity, and the cart shows the price it actually charges. The
 * percentages below only label the presets and estimate a preview; they never
 * set a price that is charged. */

export type PackOption = {
  quantity: number;
  label: string;
  /** Display estimate only; WooCommerce decides the real discount. */
  discountPercent: number;
};

export const PACK_OPTIONS: PackOption[] = [
  { quantity: 2, label: "2 Bottles", discountPercent: 5 },
  { quantity: 5, label: "5 Bottles", discountPercent: 9 },
  { quantity: 10, label: "10 Bottles", discountPercent: 15 },
];

/** Preview of a pack's price for display, in dollars. Not a charged price. */
export const getPackPrice = (unitPrice: number, quantity: number, discountPercent: number) =>
  Math.round(unitPrice * quantity * (1 - discountPercent / 100) * 100) / 100;

export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
