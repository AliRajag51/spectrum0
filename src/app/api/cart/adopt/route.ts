import { NextResponse } from "next/server";
import { env } from "@/env";
import { cartCookieHeaders, clearedCartCookieHeaders } from "@/lib/cart-cookie";
import { requestHost } from "@/lib/storefront-cookie-domain";
import { readSessionFromHeader } from "@/server/account/session";
import { readCart } from "@/server/cart/service";
import { accountsConfigured } from "@/server/wordpress/bridge";
import { redeemReturnCode } from "@/server/wordpress/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The way back from WooCommerce.
 *
 * `/api/cart/adopt` is the path NVM Headless Core sends the browser to after
 * checkout, "back to shop" or a sign-in on the WordPress side, carrying a
 * single-use code. Redeeming it tells this server which WordPress session the
 * browser now holds, whether the one that just checked out or the one
 * WooCommerce migrated a guest into. The jar is rebuilt from that, so the next
 * cart read here shows the same basket the customer just saw over there.
 *
 * The code is the only credential; `to` is a path on this storefront and
 * nothing more. A code that will not redeem still lands the customer on the
 * page they were heading for, with whatever jar they already had. */

function go(location: string, cookies: string[] = []) {
  const headers = new Headers({ location, "Cache-Control": "private, no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new NextResponse(null, { status: 303, headers });
}

/** A relative path on this storefront, or the cart page. */
function returnPath(value: string | null) {
  return value && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) ? value : "/cart";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = returnPath(url.searchParams.get("to"));
  const code = url.searchParams.get("code") ?? "";
  const secret = env.CART_SESSION_KEY ?? env.NVM_BRIDGE_KEY;
  if (!accountsConfigured() || !secret || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) {
    return go(to);
  }

  let adoption;
  try {
    adoption = await redeemReturnCode(code);
  } catch {
    return go(to);
  }

  const auth = readSessionFromHeader(request.headers.get("cookie"));

  if (!adoption.jar) {
    // A receipt with no identity to adopt: the basket it paid for is spent,
    // and the cookies describing it must not outlive the order.
    return go(
      to,
      adoption.orderCompleted ? clearedCartCookieHeaders({ host: requestHost(request.headers) }) : [],
    );
  }

  // Read once so the badge count is right on the page that opens, and so the
  // jar leaves with whatever token the site rotated in.
  let jar = adoption.jar;
  let count = 0;
  try {
    const result = await readCart(jar);
    jar = result.jar ?? jar;
    count = result.cart.itemCount;
  } catch {
    /* The page reads the cart itself; the identity alone is worth keeping. */
  }
  return go(to, cartCookieHeaders({ jar, auth, count, secret, host: requestHost(request.headers) }));
}
