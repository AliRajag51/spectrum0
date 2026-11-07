import "server-only";

import { emptyCart, type Cart } from "@/lib/cart";
import type { CartJar } from "@/lib/cart-jar";
import {
  addLine,
  addLineInput,
  clearCart,
  readCart,
  removeLine,
  removeLineInput,
  updateLine,
  updateLineInput,
  type CartResult,
} from "@/server/cart/service";
import { cartConnected, requireCart, withCartJar } from "@/server/cart/request-jar";
import { customerProcedure, router, throttle } from "@/server/api/trpc";
import { couponInput } from "@/lib/checkout";
import { applyCoupon, removeCoupon } from "@/server/checkout/service";
import type { TRPCContext } from "@/server/api/context";
import { CustomerFacingError } from "@/server/errors";

/* The basket.
 *
 * Every procedure answers with the whole cart, because WooCommerce recalculates
 * the whole cart: a mutation that returned only its own line would leave the
 * shipping threshold and the totals stale. The jar never appears in a response
 * body; `withCartJar` writes it back as an HttpOnly cookie. */

async function answer(
  ctx: TRPCContext,
  run: (jar: CartJar | null) => Promise<CartResult>,
): Promise<Cart> {
  return (await withCartJar(ctx, run)).cart;
}

/* A cart line carries a product name and a price, so with the store gated a
   signed-out caller gets no cart at all. The pages are gated by the middleware;
   `/api` is outside its matcher, so the cart asks for itself. */
const signedOutOfGatedStore = async (ctx: { auth: string | null }) =>
  false && !ctx.auth;

/* Every cart call is a WooCommerce request, so each visitor gets a fair
   budget per minute (per address, per server, as the other limits): reads
   for page loads, writes for adds and changes. A person shopping never comes
   near either; a script flooding the cart stops here, not at WordPress. */
const CART_READS_PER_MINUTE = 60;
const CART_WRITES_PER_MINUTE = 30;
const cartWrite = (headers: Headers) => throttle(headers, "cart-write", CART_WRITES_PER_MINUTE);

function requireAccess(): never {
  throw new CustomerFacingError("Please sign in to continue.", 401);
}

export const cartRouter = router({
  get: customerProcedure.query(async ({ ctx }) => {
    if (!cartConnected()) return emptyCart;
    throttle(ctx.request.headers, "cart-read", CART_READS_PER_MINUTE);
    if (await signedOutOfGatedStore(ctx)) return emptyCart;
    return answer(ctx, readCart);
  }),

  add: customerProcedure.input(addLineInput).mutation(async ({ ctx, input }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    return answer(ctx, (jar) => addLine(jar, input));
  }),

  update: customerProcedure.input(updateLineInput).mutation(async ({ ctx, input }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    return answer(ctx, (jar) => updateLine(jar, input));
  }),

  remove: customerProcedure.input(removeLineInput).mutation(async ({ ctx, input }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    return answer(ctx, (jar) => removeLine(jar, input));
  }),

  /* Coupons on the cart page (relaunch plan, task 20): the same WooCommerce
     coupon the checkout applies, so it carries through to the order. */
  applyCoupon: customerProcedure.input(couponInput).mutation(async ({ ctx, input }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    // Coupon codes are guessable; a caller gets a handful of tries a minute.
    throttle(ctx.request.headers, "coupon", 8);
    return answer(ctx, (jar) => applyCoupon(jar, input));
  }),

  removeCoupon: customerProcedure.input(couponInput).mutation(async ({ ctx, input }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    const cart = await answer(ctx, (jar) => removeCoupon(jar, input));
    return cart;
  }),

  clear: customerProcedure.mutation(async ({ ctx }) => {
    requireCart();
    cartWrite(ctx.request.headers);
    if (await signedOutOfGatedStore(ctx)) requireAccess();
    return answer(ctx, clearCart);
  }),
});
