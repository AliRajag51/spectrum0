import "server-only";

import { env } from "@/env";
import {
  cartCookieHeaders,
  clearedCartCookieHeaders,
  holdsCartJar,
  readCartJar,
} from "@/lib/cart-cookie";
import { adoptAnswer, adoptGuestCart } from "@/lib/cart-adoption";
import { hasIdentity, isMemberJar, type CartJar } from "@/lib/cart-jar";
import { requestHost } from "@/lib/storefront-cookie-domain";
import type { TRPCContext } from "@/server/api/context";
import { CartError, type CartResult } from "@/server/cart/service";
import { CustomerFacingError } from "@/server/errors";
import { storeApiConfigured } from "@/server/wordpress/store-api";
import { accountsConfigured, bridgeRequest } from "@/server/wordpress/bridge";

/* The shopper's WordPress cookie jar, for one tRPC request.
 *
 * Shared by the basket and the checkout, which drive the same WooCommerce
 * cart. The jar never appears in a response body. It goes back out as an
 * HttpOnly cookie, on success and on failure alike, because a refused write
 * may still have been issued an identity. */

// The jar's own key when one is set, the bridge key otherwise. With neither
// the cart is unavailable and WordPress is never called.
export const cartSecret = () => env.CART_SESSION_KEY ?? env.NVM_BRIDGE_KEY ?? null;

export function jarFor(ctx: TRPCContext): CartJar | null {
  const secret = cartSecret();
  if (!secret) return null;
  return readCartJar(ctx.request.headers.get("cookie"), ctx.auth, secret);
}

/* Member carts run once the agency's side is live (STOREFRONT_CONTRACT): until
   then a signed-in shopper keeps the guest jar, as before. */
const memberCarts = () => env.STOREFRONT_CONTRACT === "on" && accountsConfigured();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The jar for this request's cart calls.
 *
 * A signed-in shopper's guest basket is moved to their account on the first
 * cart call (see cart-adoption.ts); a member jar then carries their credential
 * for this request only, so the transport can call as them.
 */
async function requestJar(ctx: TRPCContext): Promise<CartJar | null> {
  const jar = jarFor(ctx);
  if (!ctx.auth || !memberCarts()) return isMemberJar(jar) ? null : jar;
  const auth = ctx.auth;
  const next = await adoptGuestCart(jar, {
    adopt: (identity) =>
      bridgeRequest(
        "tpc/cart-adopt",
        { v: 1, auth, cid: identity.cid, ...(identity.wcs ? { wcs: identity.wcs } : {}) },
        (value) => adoptAnswer.parse(value),
        { timeoutMs: 5_000 },
      ),
    sleep,
    now: Date.now(),
  });
  return isMemberJar(next) ? { ...next, auth } : next;
}

/** Write the rotated jar, its owner binding and the readable count. */
function persist(ctx: TRPCContext, jar: CartJar | null, count: number) {
  const secret = cartSecret();
  if (!secret) return;
  const host = requestHost(ctx.request.headers);
  if (hasIdentity(jar) || isMemberJar(jar)) {
    for (const header of cartCookieHeaders({ jar, auth: ctx.auth, count, secret, host })) {
      ctx.resHeaders.append("set-cookie", header);
    }
  } else if (holdsCartJar(ctx.request.headers.get("cookie"))) {
    // A jar this request may not use: a member's, after they signed out, or
    // one sealed under a key this deployment no longer has. Evicted, so the
    // browser stops presenting a basket it will never be shown.
    for (const header of clearedCartCookieHeaders({ host })) {
      ctx.resHeaders.append("set-cookie", header);
    }
  }
}

/** Run one cart operation with this request's jar, and keep whatever it hands back. */
export async function withCartJar<R extends CartResult>(
  ctx: TRPCContext,
  run: (jar: CartJar | null) => Promise<R>,
): Promise<R> {
  const jar = await requestJar(ctx);
  try {
    const result = await run(jar);
    persist(ctx, result.jar ?? jar, result.cart.itemCount);
    return result;
  } catch (error) {
    if (error instanceof CartError) persist(ctx, error.jar, error.jar.count);
    throw error;
  }
}

export const cartConnected = () => storeApiConfigured() && Boolean(cartSecret());

export function requireCart() {
  if (!cartConnected()) {
    throw new CustomerFacingError("The cart is not connected on this deployment.", 503);
  }
}
