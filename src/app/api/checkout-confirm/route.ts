import { NextResponse } from "next/server";
import {
  clearedCheckoutStateCookie,
  readCheckoutState,
  readIntent,
} from "@/lib/checkout-handoff-state";
import { confirmCheckoutHandoff } from "@/server/wordpress/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The WordPress checkout hand-off, version 2, second leg.
 *
 * `/api/checkout` gave WordPress the hash of a state this browser keeps.
 * WordPress spent that code and sent the browser back here with a single-use
 * intent; this proves the state for it, server to server, and sends the
 * browser on to the final checkout URL, which opens /check-out/ (or
 * /es/finalizar-compra/) with the basket and the signed-in customer.
 *
 * Any failure (no state, a spent or foreign intent, the store unreachable)
 * lands on the cart with the notice it already shows for an unreachable
 * checkout. The basket is untouched either way, so trying again works. */

function go(location: string) {
  const headers = new Headers({
    location,
    "Cache-Control": "private, no-store",
    // The intent is in this URL: never hand it on as a Referer.
    "Referrer-Policy": "no-referrer",
  });
  // The state is single-use whatever happens next.
  headers.append("set-cookie", clearedCheckoutStateCookie());
  return new NextResponse(null, { status: 303, headers });
}

export async function GET(request: Request) {
  const intent = readIntent(new URL(request.url).searchParams.get("intent"));
  const state = readCheckoutState(request.headers.get("cookie"));
  if (!intent || !state) {
    // Which one is missing, never the values: enough to tell a cookie problem from a bad link.
    const reason = !intent ? "no_intent" : "no_state_cookie";
    console.warn(`[checkout-confirm] ${reason} on ${request.headers.get("host")}`);
    return go(`/cart?checkout=unavailable&reason=${reason}`);
  }

  const confirmed = await confirmCheckoutHandoff(intent, state);
  return go("url" in confirmed ? confirmed.url : `/cart?checkout=unavailable&reason=${confirmed.reason}`);
}
