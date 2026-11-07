import "server-only";

import { z } from "zod";
import { emptyCart, type Cart, type CartLine } from "@/lib/cart";
import { emptyJar, type CartJar } from "@/lib/cart-jar";
import type { Product } from "@/lib/types";
import { publicWordPressUrl, wordPressUploadUrl } from "@/lib/wp-urls";
import { env } from "@/env";
import { getCatalog } from "@/server/catalog";
import { CustomerFacingError } from "@/server/errors";
import {
  BUSY_MESSAGE,
  SESSION_MESSAGE,
  cartRequest,
  type StoreCart,
  type StoreOutcome,
} from "@/server/wordpress/store-api";

/* The basket, as a domain service over the WooCommerce Store API.
 *
 * WooCommerce holds the cart and does the arithmetic; this maps its shape onto
 * the storefront's own vocabulary and back. The catalogue is the translation
 * table: WooCommerce speaks in product ids, the storefront in slugs, and the
 * mapping already exists as `externalId`.
 *
 * Identity is the jar. Every operation takes the shopper's jar in and hands
 * back the jar to keep, and that holds on the failure path too: a write the
 * site refused may still have issued a `tpc_cid`, and dropping it would make
 * the next click bootstrap all over again. */

export const addLineInput = z.object({
  productId: z.string().min(1).max(100),
  variationId: z.string().min(1).max(100),
  /** Vials. The Bundle & Save tier is WooCommerce's to decide from it. */
  quantity: z.number().int().min(1).max(99),
});

export const updateLineInput = z.object({
  key: z.string().min(1).max(64),
  quantity: z.number().int().min(0).max(99),
});

export const removeLineInput = z.object({ key: z.string().min(1).max(64) });

export type CartResult = { cart: Cart; jar: CartJar | null };

/**
 * A cart failure that still carries the jar to keep.
 *
 * The transport never throws for an upstream answer, so this is the one place
 * an outcome becomes an error, and the jar rides along so the router can write
 * the cookie before the error reaches the browser.
 */
export class CartError extends CustomerFacingError {
  constructor(
    message: string,
    status: number,
    readonly jar: CartJar,
  ) {
    super(message, status);
    this.name = "CartError";
  }
}

const money = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** WooCommerce ids back to storefront ids, built once per catalogue read. */
function variationIndex(catalog: Product[]) {
  const index = new Map<number, { product: Product; variationId: string; strength: string; lot?: string }>();
  for (const product of catalog) {
    for (const variation of product.variations) {
      if (variation.externalId) {
        index.set(variation.externalId, {
          product,
          variationId: variation.id,
          strength: variation.strength,
          lot: variation.lot,
        });
      }
    }
  }
  return index;
}

export function toCart(store: StoreCart, catalog: Product[]): Cart {
  const index = variationIndex(catalog);
  const lines: CartLine[] = [];

  for (const item of store.items) {
    const match = index.get(item.id);
    // A line the storefront cannot name is still the customer's, so it is
    // carried with what WooCommerce gave rather than silently dropped.
    lines.push({
      key: item.key,
      productId: match?.product.id ?? "",
      variationId: match?.variationId ?? "",
      quantity: item.quantity,
      name: match?.product.name ?? item.name,
      strength:
        match?.strength ?? item.variation.map((attribute) => attribute.value).join(" · "),
      image:
        wordPressUploadUrl(item.images[0]?.thumbnail || item.images[0]?.src, publicWordPressUrl(env)) ||
        match?.product.image ||
        "",
      lot: match?.lot,
      unitPrice: money(item.prices.price),
      regularUnitPrice: money(item.prices.regular_price),
      lineTotal: money(item.totals.line_total),
      discountPercent: item.extensions.tpc?.discount_percent ?? 0,
      bundleSavings: item.extensions.tpc?.bundle_savings || undefined,
    });
  }

  return {
    lines,
    subtotal: money(store.totals.total_items),
    total: money(store.totals.total_price),
    totalShipping: money(store.totals.total_shipping),
    totalDiscount: money(store.totals.total_discount),
    currency: store.totals.currency_code || "USD",
    itemCount: store.items_count,
    needsShipping: store.needs_shipping,
    coupons: store.coupons.map((coupon) => ({
      code: coupon.code,
      discount: money(coupon.totals?.total_discount ?? "0"),
    })),
  };
}

/**
 * The outcome that ends an operation, or the error it becomes.
 *
 * `applied` is the only answer with a cart in it. The transport has already
 * spent the one retry each of the others earns, so what is left is reported:
 * a refusal in WooCommerce's words with its status, and everything else as the
 * store being unavailable, which is what the customer can act on.
 */
export function settle(result: StoreOutcome): { cart: StoreCart; jar: CartJar } {
  switch (result.outcome) {
    case "applied":
      return { cart: result.cart, jar: result.jar };
    case "refused":
      throw new CartError(result.message, result.status, result.jar);
    case "busy":
      throw new CartError(BUSY_MESSAGE, 409, result.jar);
    case "unavailable":
      throw new CartError(result.message, 503, result.jar);
    case "bootstrap":
    case "token_lost":
      throw new CartError(SESSION_MESSAGE, 503, result.jar);
  }
}

async function respond(result: StoreOutcome): Promise<CartResult> {
  const settled = settle(result);
  return { cart: toCart(settled.cart, await getCatalog()), jar: settled.jar };
}

/** The basket for this jar. A visitor with no jar has an empty one, unasked. */
export async function readCart(jar: CartJar | null): Promise<CartResult> {
  if (!jar) return { cart: emptyCart, jar: null };
  return respond(await cartRequest(jar, { route: "cart" }));
}

export async function addLine(
  jar: CartJar | null,
  input: z.infer<typeof addLineInput>,
): Promise<CartResult> {
  const catalog = await getCatalog();
  const product = catalog.find((candidate) => candidate.id === input.productId);
  const variation = product?.variations.find((candidate) => candidate.id === input.variationId);

  if (!product || !variation) {
    throw new CustomerFacingError("That product is no longer available.", 404);
  }
  /* The offline snapshot carries no WooCommerce ids, so with the catalogue flag
     off there is nothing to add a line against. That is a deployment state, not
     a discontinued product, and saying so is the difference between an operator
     checking a flag and an operator hunting a missing product. */
  if (!variation.externalId) {
    throw new CustomerFacingError(
      "The cart is not connected on this deployment yet.",
      503,
    );
  }
  if (!variation.inStock || variation.price === null) {
    throw new CustomerFacingError("That strength is out of stock.", 409);
  }

  // A first write goes out with an empty jar; the transport bootstraps it.
  return respond(
    await cartRequest(jar ?? emptyJar(), {
      route: "cart/add-item",
      // Nothing but the vial count. The site decides the tier from it, so a
      // repeat of the same strength grows the one line and the tier follows.
      body: { id: variation.externalId, quantity: input.quantity },
    }),
  );
}

export async function updateLine(
  jar: CartJar | null,
  input: z.infer<typeof updateLineInput>,
): Promise<CartResult> {
  if (!jar) return { cart: emptyCart, jar: null };
  if (input.quantity === 0) return removeLine(jar, { key: input.key });

  return respond(
    await cartRequest(jar, {
      route: "cart/update-item",
      body: { key: input.key, quantity: input.quantity },
    }),
  );
}

/**
 * Empty the basket.
 *
 * The Store API has no clear route, so this is one removal per line. They run
 * in sequence rather than together because each answers with the whole
 * recalculated cart, and the last answer has to be the one that is true.
 */
export async function clearCart(jar: CartJar | null): Promise<CartResult> {
  if (!jar) return { cart: emptyCart, jar: null };
  let latest = settle(await cartRequest(jar, { route: "cart" }));
  for (const line of latest.cart.items) {
    latest = settle(
      await cartRequest(latest.jar, { route: "cart/remove-item", body: { key: line.key } }),
    );
  }
  return { cart: toCart(latest.cart, await getCatalog()), jar: latest.jar };
}

export async function removeLine(
  jar: CartJar | null,
  input: z.infer<typeof removeLineInput>,
): Promise<CartResult> {
  if (!jar) return { cart: emptyCart, jar: null };
  return respond(
    await cartRequest(jar, { route: "cart/remove-item", body: { key: input.key } }),
  );
}
