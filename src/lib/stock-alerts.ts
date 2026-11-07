import { z } from "zod";
import type { Product, Variation } from "./types";

/* Restock alerts, the parts every surface agrees on.
 *
 * A customer who finds a strength out of stock can leave an email address and
 * get one message when it comes back. The request is stored beside the stock
 * it waits on - in WooCommerce, by the site plugin - because WooCommerce is
 * the only thing that knows the moment a status flips. This module is the
 * vocabulary shared by the form, the tRPC procedure and the tests; nothing
 * here touches the network. */

export const stockAlertInput = z.object({
  productId: z.string().min(1).max(100),
  variationId: z.string().min(1).max(100),
  email: z.string().trim().email().max(320),
});
export type StockAlertInput = z.infer<typeof stockAlertInput>;

/** What the site plugin answers. A stable enum, so the UI can word each case. */
export const stockAlertStatus = z.enum([
  "subscribed",
  "already_subscribed",
  "in_stock",
]);
export type StockAlertStatus = z.infer<typeof stockAlertStatus>;

export type StockAlertResult = { status: StockAlertStatus; message: string };

/**
 * The WooCommerce ids an alert is filed against.
 *
 * A simple product has no variations, so the catalogue mapping gives it one
 * synthetic variation carrying the parent's own id. WooCommerce must see that
 * as "the product itself", not as a variation, or it would look for a child
 * that does not exist.
 */
export function stockAlertTarget(product: Product, variation: Variation) {
  if (!product.externalId || !variation.externalId) return null;
  return {
    product_id: product.externalId,
    variation_id:
      variation.externalId === product.externalId ? 0 : variation.externalId,
  };
}

/** The line the customer reads after asking. Written for the customer, not the log. */
export function stockAlertMessage(
  status: StockAlertStatus,
  product: Pick<Product, "name">,
  variation: Pick<Variation, "strength">,
  email: string,
) {
  const item = `${product.name} ${variation.strength}`.trim();
  switch (status) {
    case "subscribed":
      return `You're on the list. We'll send one email to ${email} as soon as ${item} is back in stock.`;
    case "already_subscribed":
      return `${email} is already on the list for ${item}. We'll email you as soon as it's back.`;
    case "in_stock":
      return `Good news: ${item} is back in stock now. Refresh the page to add it to your cart.`;
  }
}

/**
 * The strength a restock email points at.
 *
 * The email links to `/product/<id>?strength=<variation id>`, and the product
 * page reads that on arrival so the customer lands on the strength they asked
 * about rather than the first one. Anything that is not one of this product's
 * variations is ignored: the page falls back to its default, never to nothing.
 *
 * WordPress's own preselect, `?attribute_mg=10+MG`, still arrives from the
 * product feeds and old links (task 4). It names the strength rather than the
 * variation, written "10 MG" or "10MG", so it is matched on the label.
 */
export function variationFromSearch(
  search: string,
  variations: (Pick<Variation, "id"> & { strength?: string })[],
) {
  const params = new URLSearchParams(search);
  const wanted = params.get("strength");
  if (wanted && variations.some((variation) => variation.id === wanted)) return wanted;
  const label = strengthKey(params.get("attribute_mg") ?? "");
  if (!label) return null;
  return variations.find((variation) => strengthKey(variation.strength ?? "") === label)?.id ?? null;
}

const strengthKey = (value: string) => value.replace(/[\s+]/g, "").toLowerCase();
