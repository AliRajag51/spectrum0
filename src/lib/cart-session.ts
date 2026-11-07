/* When a Store API refusal means the token, not the cart, is the problem.
 *
 * On this site identity is the `tpc_cid` cookie and the `Cart-Token` is only
 * the write credential. A write that arrives with the cookie but without an
 * acceptable token is refused with one of WooCommerce's nonce complaints, and
 * the cure is a fresh token for the *same* identity: read the cart with the
 * jar's cookies, take the token that comes back, send the write again.
 *
 * Kept apart from the transport so the rule can be read and tested on its own,
 * because getting it wrong is not visible: too narrow and the storefront
 * wedges on a stale token, too wide and a real refusal ("out of stock") is
 * retried and then reported as something else. A 5xx is never in this set. A
 * store that is down has said nothing about the session, and minting a new one
 * on its behalf is how a customer's basket used to vanish during an outage. */

export const tokenLostCodes: ReadonlySet<string> = new Set([
  "woocommerce_rest_missing_nonce",
  "woocommerce_rest_invalid_nonce",
  "woocommerce_rest_cart_token_invalid",
]);

/** Whether this failed response means only the token needs replacing. */
export function tokenLost({ status, code }: { status: number; code: string }) {
  return (status === 401 || status === 403) && tokenLostCodes.has(code);
}
