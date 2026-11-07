import { NextResponse } from "next/server";
import { env } from "@/env";
import { cartCookieHeaders, readCartJar } from "@/lib/cart-cookie";
import { isMemberJar, type CartJar } from "@/lib/cart-jar";
import { checkoutStateCookie, newCheckoutState } from "@/lib/checkout-handoff-state";
import { requestOrigin } from "@/lib/request-origin";
import { requestHost } from "@/lib/storefront-cookie-domain";
import {
  clearedDisplayCookieHeaders,
  clearedSessionCookieHeader,
  readSessionFromHeader,
} from "@/server/account/session";
import { readViewer } from "@/server/account/service";
import { readCart } from "@/server/cart/service";
import { storefrontCheckoutOn } from "@/server/checkout-owner";
import { accountsConfigured } from "@/server/wordpress/bridge";
import { handoff, memberHandoffJar } from "@/server/wordpress/handoff";
import { checkoutRequiresAccount } from "@/server/wordpress/checkout-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Checkout: the storefront's last step before WooCommerce.
 *
 * `/api/checkout` is the path NVM Headless Core's own contract names, so this
 * is where the journey crosses over. The basket is already a WooCommerce cart -
 * the storefront has been writing to it all along - so nothing is copied here.
 * The handoff carries the jar's WordPress identity and, when there is one, the
 * session, and WooCommerce creates, prices and takes payment for the order
 * natively. The way back is `/api/cart/adopt`.
 *
 * A GET because it is a navigation, not a mutation: nothing is created on this
 * side, and WooCommerce's checkout is idempotent to arrive at. */

function go(location: string, cookies: string[] = []) {
  const headers = new Headers({
    location,
    "Cache-Control": "private, no-store",
    // The bridge resolves the storefront origin from the Referer when no
    // production frontend URL is configured. Send the origin, never the path.
    "Referrer-Policy": "origin",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new NextResponse(null, { status: 303, headers });
}

/* A short code for the cart's address: an error code or HTTP status, never a
   message or a value (Oct 26: so a screenshot says which check failed). */
function reasonCode(error: unknown) {
  const coded = error as { code?: unknown; status?: unknown } | null;
  const code = typeof coded?.code === "string" ? coded.code : "";
  const status = typeof coded?.status === "number" ? String(coded.status) : "";
  return [code, status].filter(Boolean).join("_").replace(/[^a-z0-9_]/gi, "").slice(0, 48) || "error";
}

/** The credential travels on a jar for one call only; it is never sealed back into the cookie. */
const withoutAuth = (jar: CartJar): CartJar => {
  const { auth: _auth, ...rest } = jar;
  return rest;
};

const SIGN_IN = `/account?redirect=${encodeURIComponent("/api/checkout")}`;

/** Stop presenting a session WordPress has stopped honouring. */
const forgetSession = (host: string) => [
  clearedSessionCookieHeader({ host }),
  ...clearedDisplayCookieHeaders({ host }),
];

export async function GET(request: Request) {
  /* The storefront's own checkout, when Headless Core says so ("Use the
     storefront's own checkout"). Every cart button already points here, so
     this one line moves them all, and switching it off again restores the
     WooCommerce handoff below untouched. Off for now (the agency, Oct 26):
     Tagada's Apple Pay covers peptidescollective.com and es., not www. */
  if (await storefrontCheckoutOn()) return go("/checkout");

  if (!env.NVM_BRIDGE_KEY || !env.WOOCOMMERCE_URL) {
    return go("/cart?checkout=unavailable&reason=not_configured");
  }

  const cookieHeader = request.headers.get("cookie");
  const presented = readSessionFromHeader(cookieHeader);

  /* A presented session is verified first: a lapsed one would make the bridge
     refuse the handoff, and that member's basket is bound to the account.
     `readViewer` separates a rejected credential (null) from an unreachable
     store (throw); only the first is the customer's to act on. */
  const auth = presented;
  if (accountsConfigured() && presented) {
    let viewer;
    try {
      viewer = await readViewer(presented);
    } catch (error) {
      return go(`/cart?checkout=unavailable&reason=account_${reasonCode(error)}`);
    }
    if (!viewer) return go(SIGN_IN, forgetSession(requestHost(request.headers)));
  }

  // Read the live WooCommerce setting on every attempt. A WordPress admin can
  // change guest checkout without a Next.js deployment or a stale policy cache.
  if (!auth) {
    try {
      if (await checkoutRequiresAccount()) return go(SIGN_IN);
    } catch (error) {
      return go(`/cart?checkout=unavailable&reason=policy_${reasonCode(error)}`);
    }
  }
  const secret = env.CART_SESSION_KEY ?? env.NVM_BRIDGE_KEY;
  const held = readCartJar(cookieHeader, auth, secret);
  if (!held) return go("/cart?checkout=empty");

  // Confirmed against WooCommerce rather than the readable count hint: an empty
  // basket must not become a checkout the customer cannot complete.
  /* A signed-in member's basket is their account's own: it is read as them,
     with their credential for this request only, exactly as the cart page
     reads it. Read without it, the agency's gate answers 401 (Oct 26). */
  const member = isMemberJar(held) && Boolean(auth);
  let jar = held;
  let count = 0;
  try {
    const result = await readCart(member ? { ...held, auth: auth! } : held);
    if (!result.cart.lines.length) return go("/cart?checkout=empty");
    jar = withoutAuth(result.jar ?? held);
    count = result.cart.itemCount;
  } catch (error) {
    return go(`/cart?checkout=unavailable&reason=cart_${reasonCode(error)}`);
  }

  /* The request itself is the only honest source for both: this route answers
     on www and on es, and the locale follows from the host. Version 2 binds the
     hand-off to this browser: WordPress gets the state's hash, the browser
     keeps the state, and `/api/checkout-confirm` proves it on the way back. */
  /* The browser's own origin, not `request.url`'s: WordPress sends the browser
     back to exactly this host, and the state cookie lives only on it. */
  const origin = requestOrigin(request);
  const checkoutState = newCheckoutState();
  const made = await handoff({
    auth,
    /* A member jar names no guest basket, and the bridge needs one to mint a
       code. A fresh, unsigned cart id serves: the agency's cart plugin ignores
       an id it did not sign, so once WordPress signs the browser in as the
       member, its checkout opens the account's own cart. */
    jar: member ? memberHandoffJar() : jar,
    frontend: origin,
    locale: "en",
    checkoutStateHash: checkoutState.hash,
  });
  /* The reason is a short code (the bridge's error code, never a value), so a
     screenshot of the cart says which step failed (Oct 26). */
  if (!("url" in made)) return go(`/cart?checkout=unavailable&reason=${made.reason}`);
  const destination = made.url;
  // The read may have rotated the token; the jar leaves with the browser.
  return go(destination, [
    ...cartCookieHeaders({ jar, auth, count, secret, host: requestHost(request.headers) }),
    checkoutStateCookie(checkoutState.state),
  ]);
}
