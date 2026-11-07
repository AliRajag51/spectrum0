/* The readable half of the cart cookies, safe for client components.
 *
 * `pc_cart` carries the vial count WooCommerce last confirmed, so the header
 * badge is right on first paint instead of counting up after a request. It is
 * display state the browser may edit; the basket itself is the HttpOnly token,
 * and every total on screen comes from WooCommerce. */

export const CART_HINT_COOKIE = "ssb_cart";
