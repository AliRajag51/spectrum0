import { createHash, randomBytes } from "node:crypto";
import { readCookie } from "./cart-cookie.ts";

/* The WordPress checkout hand-off, version 2 (NVM Headless Core 2.7.x).
 *
 * Version 1 sent the browser straight from the hand-off code to /check-out/,
 * so whoever held the URL held the basket and the signed-in session. Version 2
 * binds the hand-off to the browser that started it: `/api/checkout` keeps a
 * random state here, in an HttpOnly cookie, and gives WordPress only its
 * SHA-256. WordPress sends the browser back to `/api/checkout-confirm` with a
 * single-use intent, the storefront server proves the state, and only then does
 * WordPress mint the final checkout URL.
 *
 * The cookie is host-only and scoped to the confirm route, so it never leaves
 * this storefront host and is never sent anywhere else on it. */

export const CHECKOUT_STATE_COOKIE = "ssb_checkout_state";
const CONFIRM_PATH = "/api/checkout-confirm";
/* The bridge keeps each code for 120 s; the whole round trip is two redirects. */
const STATE_MAX_AGE = 300;
const STATE_SHAPE = /^[a-f0-9]{64}$/;

const isSecure = () => process.env.NODE_ENV === "production";

/** A fresh state for one checkout, and the hash WordPress stores for it. */
export function newCheckoutState() {
  const state = randomBytes(32).toString("hex");
  return { state, hash: checkoutStateHash(state) };
}

export function checkoutStateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function checkoutStateCookie(state: string) {
  return [
    `${CHECKOUT_STATE_COOKIE}=${state}`,
    `Path=${CONFIRM_PATH}`,
    `Max-Age=${STATE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(isSecure() ? ["Secure"] : []),
  ].join("; ");
}

export function clearedCheckoutStateCookie() {
  return [
    `${CHECKOUT_STATE_COOKIE}=`,
    `Path=${CONFIRM_PATH}`,
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(isSecure() ? ["Secure"] : []),
  ].join("; ");
}

/** The state this browser holds, or null when it holds none in the right shape. */
export function readCheckoutState(cookieHeader: string | null | undefined) {
  const value = readCookie(cookieHeader, CHECKOUT_STATE_COOKIE);
  return value && STATE_SHAPE.test(value) ? value : null;
}

/** WordPress's intent, in the only shape the bridge mints and accepts (48 hex). */
export function readIntent(value: string | null) {
  return value && /^[a-f0-9]{48}$/.test(value) ? value : null;
}
