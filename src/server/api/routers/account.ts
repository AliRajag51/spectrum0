import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clearedCartCookieHeaders } from "@/lib/cart-cookie";
import { signupMarkerCookieHeader } from "@/lib/signup-marker";
import { requestHost } from "@/lib/storefront-cookie-domain";
import { givenName } from "@/lib/identity-hint";
import { declarationInput } from "@/lib/research-declaration";
import {
  customerProcedure,
  protectedProcedure,
  router,
  throttle,
} from "@/server/api/trpc";
import {
  clearedDisplayCookieHeaders,
  clearedSessionCookieHeader,
  displayCookieHeaders,
  sessionCookieHeader,
} from "@/server/account/session";
import {
  addressInput,
  changePassword,
  getAddressBook,
  getOrder,
  listOrders,
  lostPasswordInput,
  orderInput,
  ordersInput,
  passwordInput,
  profileInput,
  readViewer,
  register,
  registerInput,
  requestPasswordReset,
  resetPassword,
  resetPasswordInput,
  saveAddress,
  saveDeclaration,
  signIn,
  signInInput,
  signOut,
  updateProfile,
  type Session,
} from "@/server/account/service";
import { accountsConfigured } from "@/server/wordpress/bridge";
import { statesForCountry } from "@/server/wordpress/locations";

/* The account surface.

   Sign in, registration and a password change all mint a WordPress session,
   and all three answer with the same shape: the customer, plus a `Set-Cookie`
   the browser never gets to read. The credential itself is deliberately absent
   from every response body. */

type CookieContext = { request: Request; resHeaders: Headers };

function issue(
  ctx: CookieContext,
  session: Pick<Session, "auth" | "expires">,
  user?: Session["user"],
  persistent = true,
) {
  const host = requestHost(ctx.request.headers);
  ctx.resHeaders.append(
    "set-cookie",
    sessionCookieHeader(session.auth, session.expires, { persistent, host }),
  );
  /* A new generation on every authentication event. The cart watches it so one
     customer's basket cannot outlive their session on a shared browser. */
  for (const header of displayCookieHeaders(
    "member",
    session.expires,
    user ? givenName(user) : "",
    { persistent, host },
  )) {
    ctx.resHeaders.append("set-cookie", header);
  }
}

export const accountRouter = router({
  /* Drives every signed-in/signed-out branch in the UI. `configured` separates
     "not signed in" from "accounts are not connected on this deployment", which
     are the same blank screen to a customer but very different to an operator. */
  viewer: customerProcedure.query(async ({ ctx }) => {
    const viewer = accountsConfigured() ? await readViewer(ctx.auth) : null;
    // The OpenAI match values go to the pixel alone (tracking.adMatch), never to the page.
    return {
      configured: accountsConfigured(),
      user: viewer ? { ...viewer, openaiMatch: undefined } : null,
    };
  }),

  signIn: customerProcedure.input(signInInput).mutation(async ({ ctx, input }) => {
    throttle(ctx.request.headers, "signin", 10);
    const session = await signIn(input);
    issue(ctx, session, session.user, input.remember);
    return { user: session.user };
  }),

  register: customerProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    throttle(ctx.request.headers, "register", 10);
    const session = await register(input);
    issue(ctx, session, session.user);
    // Microsoft Ads' sign-up marker (task 7); GA4's comes from WordPress. Not under GPC.
    if (ctx.request.headers.get("sec-gpc") !== "1") {
      ctx.resHeaders.append(
        "set-cookie",
        signupMarkerCookieHeader("email", new URL(ctx.request.url).protocol === "https:"),
      );
    }
    return { user: session.user };
  }),

  /* The research declaration, made once, by an account that does not have one
     yet: a sign-up through Google that came from the sign-in page. */
  saveDeclaration: protectedProcedure
    .input(declarationInput)
    .mutation(async ({ ctx, input }) => {
      throttle(ctx.request.headers, "declaration", 10);
      await saveDeclaration(ctx.auth, input, "storefront-step");
      return { ok: true as const };
    }),

  signOut: customerProcedure.mutation(async ({ ctx }) => {
    if (ctx.auth) await signOut(ctx.auth);
    // Cleared whatever WordPress answered: a session the storefront cannot
    // destroy upstream must still stop being presented by this browser.
    const host = requestHost(ctx.request.headers);
    ctx.resHeaders.append("set-cookie", clearedSessionCookieHeader({ host }));
    for (const header of clearedDisplayCookieHeaders({ host })) {
      ctx.resHeaders.append("set-cookie", header);
    }
    // The basket was theirs; on a shared browser the next person is not them.
    for (const header of clearedCartCookieHeaders({ host })) {
      ctx.resHeaders.append("set-cookie", header);
    }
    return { ok: true as const };
  }),

  orders: protectedProcedure
    .input(ordersInput)
    .query(({ ctx, input }) => listOrders(ctx.auth, input)),

  order: protectedProcedure
    .input(orderInput)
    .query(({ ctx, input }) => getOrder(ctx.auth, input)),

  addresses: protectedProcedure.query(({ ctx }) => getAddressBook(ctx.auth)),

  saveAddress: protectedProcedure
    .input(addressInput)
    .mutation(({ ctx, input }) => saveAddress(ctx.auth, input)),

  updateProfile: protectedProcedure
    .input(profileInput)
    .mutation(async ({ ctx, input }) => {
      const user = await updateProfile(ctx.auth, input);
      // The header prints this name, so a rename has to reach the hint cookie.
      for (const header of displayCookieHeaders(
        "member",
        Math.floor(Date.now() / 1000) + 14 * 86400,
        givenName(user),
        { host: requestHost(ctx.request.headers) },
      )) {
        ctx.resHeaders.append("set-cookie", header);
      }
      return user;
    }),

  changePassword: protectedProcedure
    .input(passwordInput)
    .mutation(async ({ ctx, input }) => {
      const rotated = await changePassword(ctx.auth, input);
      issue(ctx, rotated);
      return { ok: true as const };
    }),

  lostPassword: customerProcedure
    .input(lostPasswordInput)
    .mutation(({ ctx, input }) => {
      throttle(ctx.request.headers, "lost-password", 5);
      return requestPasswordReset(input);
    }),

  resetPassword: customerProcedure
    .input(resetPasswordInput)
    .mutation(({ ctx, input }) => {
      throttle(ctx.request.headers, "reset-password", 10);
      return resetPassword(input);
    }),

  /* The states list for one country, so the address form can re-render after a
     country change without shipping WooCommerce's entire table to the browser.
     Public reference data, but kept behind the session because only a
     signed-in customer has an address form to fill in. */
  states: protectedProcedure
    .input(z.object({ country: z.string().trim().length(2) }))
    .query(({ input }) => statesForCountry(input.country)),
});
