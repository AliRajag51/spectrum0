import "server-only";

import { z } from "zod";
import { env } from "@/env";
import { randomBytes } from "node:crypto";
import { CART_ID_COOKIE, emptyJar, jarFromIdentity, jarIdentity, tokenJar, type CartJar } from "@/lib/cart-jar";
import { publicWordPressUrl, wordPressStoreUrl } from "@/lib/wp-urls";
import { BridgeError, bridgeRequest } from "@/server/wordpress/bridge";
import { storeRequest } from "@/server/wordpress/store-api";

/* The single-use handoff into WooCommerce, and the return from it.
 *
 * Two journeys use it and they differ only in what they carry. Checkout hands
 * over the basket, so WooCommerce's own checkout can price, take payment and
 * issue the receipt in the environment its gateway plugins expect. Paying an
 * existing order hands over the order id instead, because WooCommerce grants
 * `pay_for_order` only to the signed-in owner of an account order and the
 * customer's browser holds no WordPress session.
 *
 * What identifies the basket is the jar: the site's `tpc_cid` cookie and the
 * WooCommerce session cookie, which the bridge sets on the browser as it
 * arrives. The `Cart-Token` still travels for a bridge that predates the
 * identity object. On the way back the bridge reads those cookies off the
 * returning browser and reports them, and the jar is rebuilt from that.
 *
 * Both need the browser to arrive as a genuine top-level navigation: the code
 * is spent on redemption, and the bridge refuses a sub-resource request. */

const handoffPayload = z.object({
  code: z.string().min(1),
  checkout_url: z.string().min(1),
});

const adoption = z.object({
  cart_token: z.string().nullish(),
  order_completed: z.boolean().default(false),
  identity: z
    .object({ cid: z.string().min(1), wcs: z.string().nullish() })
    .nullish(),
});

/**
 * The cart identity a signed-in member's checkout hand-off carries.
 *
 * Their basket is the account's own, found by the sign-in, not by a guest
 * cookie, but the bridge mints a code only for a named basket. A fresh random
 * `tpc_cid` names an empty one: tpc-store honours only a cid it signed, so
 * this one is ignored on arrival and the signed-in browser keeps the account
 * cart (the agency, Oct 26: "your cart calls already run as the member").
 */
export const memberHandoffJar = (): CartJar => ({
  v: 1,
  count: 0,
  cid: `${CART_ID_COOKIE}=${randomBytes(16).toString("hex")}`,
});

/** A throwaway session, for a handoff that carries no basket. */
async function borrowedJar(): Promise<CartJar | null> {
  const opening = await storeRequest(emptyJar(), { route: "cart" });
  return opening.outcome === "applied" ? opening.jar : null;
}

/**
 * Where to send the browser, or null when the handoff cannot be built.
 *
 * Null is not an error: the callers each have a working fallback that costs the
 * customer an extra step rather than the journey.
 */
export async function handoffUrl(input: HandoffInput): Promise<string | null> {
  const result = await handoff(input);
  return "url" in result ? result.url : null;
}

/** The hand-off, or the short code saying why it could not be made (no values in it). */
export type HandoffResult = { url: string } | { reason: string };

type HandoffInput = {
  auth: string | null;
  jar?: CartJar | null;
  payOrderId?: number;
  /* Which storefront the shopper is actually on, and which language they are
     reading. The storefront answers on two hosts, so the bridge cannot know
     either from the call alone, and both decide where WordPress sends them
     back to and which checkout it builds. Both are validated upstream against
     the bridge's own allowlist and language list, so naming ourselves here
     cannot send anyone anywhere WordPress does not already trust. */
  frontend?: string;
  locale?: string;
  /* Checkout only: the SHA-256 of the state `/api/checkout` keeps in the
     browser. With it the bridge runs hand-off version 2 and returns the
     browser to `/api/checkout-confirm` before it opens the checkout. */
  checkoutStateHash?: string;
};

export async function handoff({
  auth,
  jar,
  payOrderId,
  frontend,
  locale,
  checkoutStateHash,
}: HandoffInput): Promise<HandoffResult> {
  const carried = jar ?? (await borrowedJar());
  const identity = jarIdentity(carried);
  const token = carried?.token;
  if (!identity && !token) return { reason: "no_cart_identity" };
  try {
    const payload = await bridgeRequest(
      "handoff-code",
      {
        ...(token ? { cart_token: token } : {}),
        ...(identity ? { identity } : {}),
        ...(auth ? { auth } : {}),
        ...(payOrderId ? { pay_order_id: payOrderId } : {}),
        ...(frontend ? { frontend } : {}),
        ...(locale ? { locale } : {}),
        ...(checkoutStateHash
          ? { checkout_handoff_version: 2, checkout_state_hash: checkoutStateHash }
          : {}),
      },
      (value) => handoffPayload.parse(value),
    );
    // Upstream data becoming a browser navigation, so it is pinned to the store.
    const url = wordPressStoreUrl(payload.checkout_url, publicWordPressUrl(env));
    if (!url) {
      console.warn("[handoff] the bridge's checkout URL is not on the store host");
      return { reason: "not_store_host" };
    }
    return { url };
  } catch (error) {
    console.warn(`[handoff] handoff-code failed: ${bridgeFailure(error)}`);
    return { reason: failureReason(error) };
  }
}

/** The bridge's error code and status, which say why without carrying any value. */
const bridgeFailure = (error: unknown) =>
  error instanceof BridgeError ? `${error.code} (${error.status})` : error instanceof Error ? error.name : "unknown";

/** The same, as a short code fit for the cart's address: letters, digits and _ only. */
const failureReason = (error: unknown) =>
  (error instanceof BridgeError ? `${error.code}_${error.status}` : "unknown").replace(/[^a-z0-9_]/gi, "").slice(0, 48) || "unknown";

/**
 * Hand-off version 2, second leg: prove the browser's state for WordPress's
 * intent and get the final checkout URL. Null when the bridge refuses (spent,
 * expired, or another browser's intent) or cannot be reached.
 */
export async function confirmCheckoutHandoff(intent: string, state: string): Promise<HandoffResult> {
  try {
    const payload = await bridgeRequest("confirm-handoff", { intent, state }, (value) => handoffPayload.parse(value));
    const url = wordPressStoreUrl(payload.checkout_url, publicWordPressUrl(env));
    return url ? { url } : { reason: "not_store_host" };
  } catch (error) {
    console.warn(`[handoff] confirm-handoff failed: ${bridgeFailure(error)}`);
    return { reason: `confirm_${failureReason(error)}` };
  }
}

export type Adoption = {
  /** The jar to keep, rebuilt from the cookies the bridge read. Null: none. */
  jar: CartJar | null;
  /** A verified receipt: whatever basket this browser held has been spent. */
  orderCompleted: boolean;
};

/**
 * Redeem the code WooCommerce sends the browser back with.
 *
 * Throws only when the bridge refused or could not be reached; the caller
 * treats both as "carry on without a jar", because the storefront page the
 * customer is returning to works either way.
 */
export async function redeemReturnCode(code: string): Promise<Adoption> {
  const payload = await bridgeRequest("redeem-code", { code }, (value) => adoption.parse(value));
  return {
    // A native WooCommerce store answers with the Cart-Token alone (no cookie identity).
    jar: payload.identity
      ? jarFromIdentity(payload.identity, payload.cart_token)
      : payload.cart_token
        ? tokenJar(payload.cart_token)
        : null,
    orderCompleted: payload.order_completed,
  };
}
