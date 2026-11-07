import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { RESEARCH_STATUSES, declarationOwed, researchOnFile, type Declaration } from "@/lib/research-declaration";
import { env } from "@/env";
import {
  emptyAddress,
  type AccountAddress,
  type AccountAddressBook,
  type AccountOrder,
  type AccountOrderDetail,
  type Viewer,
} from "@/lib/account";
import { publicWordPressUrl, wordPressUploadUrl } from "@/lib/wp-urls";
import {
  accountsConfigured,
  BridgeError,
  bridgeRequest,
} from "@/server/wordpress/bridge";

/* Customer account operations, one function per bridge route.

   Nothing here accepts a caller supplied user id: identity is always the auth
   credential in the session cookie, which WordPress revalidates on every call.
   Upstream payloads are parsed before use and mapped to the storefront view
   models, so no WordPress field shape reaches a component. */

/* ------------------------------------------------------------------ inputs */

/* Defined in ./inputs.ts, which stays free of `server-only` and `@/env` so a
   test can parse a form's input without loading this module's transport.
   Re-exported here because every caller already imports them from the
   service. */
import {
  addressInput,
  facebookCompleteInput,
  lostPasswordInput,
  orderInput,
  ordersInput,
  passwordInput,
  profileInput,
  registerInput,
  resetPasswordInput,
  signInInput,
} from "./inputs.ts";

export {
  addressInput,
  facebookCompleteInput,
  lostPasswordInput,
  orderInput,
  ordersInput,
  passwordInput,
  profileInput,
  registerInput,
  resetPasswordInput,
  signInInput,
};

/* ---------------------------------------------------------------- upstream */

const wpUser = z.object({
  id: z.number().int().positive(),
  email: z.string().default(""),
  display_name: z.string().default(""),
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  // Bridge 2.7.5+; absent from an older bridge, which reads as "never answered".
  marketing_opt_in: z.boolean().nullable().default(null),
});

/* The agency's fields beside `user` in `me` (their contract, b1 and d), added
   through the bridge's nvm_bridge_me_payload filter. Absent until their side
   is live, or with the contract switched off on their side ("tpc": null). */
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const meExtras = z
  .object({
    v: z.literal(1),
    openai: z
      .object({ email_sha256: hex64, external_id_sha256: hex64.optional() })
      .nullable()
      .optional()
      .catch(null),
    /* The research step for returning customers: false when the account owes no
       declaration (staff, already declared, pre-gate and TikTok lead accounts),
       with the answer to send from its last paid order, or null. */
    declaration_owed: z.boolean().optional().catch(undefined),
    r4_prefill: z
      .object({ purpose: z.enum(RESEARCH_STATUSES), confirm: z.literal(true), source: z.string().max(60).optional() })
      .nullable()
      .optional()
      .catch(null),
    welcome30: z
      .object({
        code: z.string().max(40),
        state: z.enum(["none", "viewed", "claimed", "dismissed", "removed"]),
        views: z.number().int().min(0).max(10).default(0),
        show: z.boolean(),
        apply: z.boolean(),
      })
      .nullable()
      .optional()
      .catch(null),
  })
  .loose()
  .nullable()
  .optional()
  .catch(null);

const wpSession = z.object({
  auth: z.string().min(1),
  expires: z.number().int().positive(),
  user: wpUser,
});

const wpOrder = z.object({
  id: z.number().int().positive(),
  number: z.string(),
  date: z.string().nullable().default(null),
  status: z.string(),
  status_label: z.string().default(""),
  total: z.string().default("0"),
  currency: z.string().default("USD"),
  item_count: z.number().default(0),
  items: z.array(z.object({ name: z.string(), quantity: z.number() })).default([]),
});

const wpAddress = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  company: z.string().default(""),
  address_1: z.string().default(""),
  address_2: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  postcode: z.string().default(""),
  country: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
});

const wpOrderDetail = wpOrder.extend({
  payment_method_title: z.string().default(""),
  date_paid: z.string().nullable().default(null),
  date_completed: z.string().nullable().default(null),
  customer_note: z.string().default(""),
  needs_payment: z.boolean().default(false),
  billing: wpAddress,
  shipping: wpAddress,
  items: z
    .array(
      z.object({
        id: z.number().default(0),
        name: z.string().default(""),
        quantity: z.number().default(1),
        sku: z.string().default(""),
        total: z.string().default("0"),
        subtotal: z.string().default("0"),
        image: z.string().default(""),
        permalink_slug: z.string().default(""),
      }),
    )
    .default([]),
  totals: z
    .array(z.object({ label: z.string().default(""), value: z.string().default("") }))
    .default([]),
});

/* ----------------------------------------------------------------- mapping */

const toViewer = (user: z.infer<typeof wpUser>): Viewer => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
  firstName: user.first_name,
  lastName: user.last_name,
  marketingOptIn: user.marketing_opt_in,
});

const toOrder = (order: z.infer<typeof wpOrder>): AccountOrder => ({
  id: order.id,
  number: order.number,
  date: order.date,
  status: order.status,
  statusLabel: order.status_label || order.status,
  total: order.total,
  currency: order.currency,
  itemCount: order.item_count,
  items: order.items,
});

const toAddress = (address: z.infer<typeof wpAddress>): AccountAddress => ({
  firstName: address.first_name,
  lastName: address.last_name,
  company: address.company,
  address1: address.address_1,
  address2: address.address_2,
  city: address.city,
  state: address.state,
  postcode: address.postcode,
  country: address.country,
  email: address.email,
  phone: address.phone,
});

const fromAddress = (fields: z.infer<typeof addressInput>["fields"]) => ({
  first_name: fields.firstName,
  last_name: fields.lastName,
  company: fields.company,
  address_1: fields.address1,
  address_2: fields.address2,
  city: fields.city,
  state: fields.state,
  postcode: fields.postcode,
  country: fields.country,
  email: fields.email,
  phone: fields.phone,
});

export type Session = { auth: string; expires: number; user: Viewer };

const toSession = (value: z.infer<typeof wpSession>): Session => ({
  auth: value.auth,
  expires: value.expires,
  user: toViewer(value.user),
});

/* ---------------------------------------------------------------- commands */

export async function signIn(input: z.infer<typeof signInInput>) {
  return toSession(
    await bridgeRequest(
      "signin",
      { email: input.email, password: input.password },
      (value) => wpSession.parse(value),
    ),
  );
}

export async function register(input: z.infer<typeof registerInput>) {
  return toSession(
    await bridgeRequest(
      "register",
      {
        email: input.email,
        password: input.password ?? "",
        first_name: input.firstName ?? "",
        last_name: input.lastName ?? "",
        declaration: input.declaration,
      },
      (value) => wpSession.parse(value),
    ),
  );
}

/** Best effort: a session WordPress already dropped is still signed out here. */
export async function signOut(auth: string) {
  forgetViewer(auth);
  try {
    await bridgeRequest("logout", { auth }, () => null);
  } catch (error) {
    if (!(error instanceof BridgeError)) throw error;
  }
}

/* A short, process-local memo of confirmed sessions.
 *
 * Every account navigation would otherwise spend a round trip to WordPress
 * re-asking who the caller is, on a host where that is not free. Only a
 * confirmed member is ever cached, never a refusal; the entry is keyed by a
 * digest of the credential, bounded in size, and expires with the earlier of
 * 60 seconds and the credential's own embedded expiry.
 *
 * It is display state, not authority. Anything that decides ownership - who an
 * order is filed against, above all - passes `fresh` and waits for WordPress.
 * Every protected read goes to the bridge with the credential regardless, and
 * WordPress validates it there. */

type ViewerEntry = { viewer: Viewer; until: number };
type ViewerCache = { entries: Map<string, ViewerEntry>; inflight: Map<string, Promise<Viewer | null>> };

const viewerGlobal = globalThis as typeof globalThis & { __tpcViewerCache?: ViewerCache };
const viewerCache: ViewerCache = (viewerGlobal.__tpcViewerCache ??= {
  entries: new Map(),
  inflight: new Map(),
});

const VIEWER_TTL_MS = 60_000;
const MAX_VIEWER_ENTRIES = 1000;

const credentialKey = (auth: string) =>
  createHash("sha256").update(auth).digest("hex");

/** Drop a credential's memo. Called whenever a session ends or rotates. */
export function forgetViewer(auth: string | null | undefined) {
  if (!auth) return;
  const key = credentialKey(auth);
  viewerCache.entries.delete(key);
  // Detached rather than cancelled: a shared read already in flight must not be
  // able to repopulate the cache for a session that has just been discarded.
  viewerCache.inflight.delete(key);
}

function rememberViewer(key: string, auth: string, viewer: Viewer) {
  const now = Date.now();
  for (const [held, entry] of viewerCache.entries) {
    if (entry.until <= now) viewerCache.entries.delete(held);
  }
  // The embedded expiry only ever shortens reuse; it never validates anything.
  const embedded = Number(auth.split("|")[1]) * 1000;
  const until = Number.isFinite(embedded) && embedded > now
    ? Math.min(now + VIEWER_TTL_MS, embedded)
    : now + VIEWER_TTL_MS;
  if (until <= now) return;
  while (viewerCache.entries.size >= MAX_VIEWER_ENTRIES) {
    const oldest = viewerCache.entries.keys().next().value;
    if (oldest === undefined) break;
    viewerCache.entries.delete(oldest);
  }
  viewerCache.entries.set(key, { viewer, until });
}

/**
 * Who the session belongs to, or null.
 *
 * An expired or revoked credential is not an error a customer should be shown
 * - it simply means signed out - so 401 maps to null, while an unreachable
 * store or a misconfigured bridge still throws.
 */
export async function readViewer(
  auth: string | null,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<Viewer | null> {
  // A stale cookie on a deployment with no bridge is signed out, not an error:
  // guest checkout and browsing must keep working without accounts configured.
  if (!auth || !accountsConfigured()) return null;
  const key = credentialKey(auth);
  if (fresh) {
    viewerCache.entries.delete(key);
  } else {
    const hit = viewerCache.entries.get(key);
    if (hit && hit.until > Date.now()) return hit.viewer;
    const shared = viewerCache.inflight.get(key);
    if (shared) return shared;
  }

  const request = (async () => {
    try {
      const payload = await bridgeRequest(
        "me",
        { auth },
        (value) => z.object({ user: wpUser, tpc: meExtras }).parse(value),
        // The agency's `tpc` fields decide consent from these (their contract, 0.2).
        {},
      );
      const viewer: Viewer = {
        ...toViewer(payload.user),
        openaiMatch: payload.tpc?.openai ?? null,
        welcome30: payload.tpc?.welcome30 ?? null,
        researchOnFile: env.STOREFRONT_CONTRACT === "on" ? researchOnFile(payload.tpc) : null,
        declarationOwed: declarationOwed(payload.tpc),
      };
      rememberViewer(key, auth, viewer);
      return viewer;
    } catch (error) {
      if (error instanceof BridgeError && error.status === 401) {
        viewerCache.entries.delete(key);
        return null;
      }
      throw error;
    }
  })();

  if (!fresh) {
    viewerCache.inflight.set(key, request);
    // Cleared outside the request so a newer read cannot be evicted by an
    // older one settling. Both branches are handled, so nothing goes unhandled.
    const release = () => {
      if (viewerCache.inflight.get(key) === request) viewerCache.inflight.delete(key);
    };
    request.then(release, release);
  }
  return request;
}

export async function listOrders(auth: string, input: z.infer<typeof ordersInput>) {
  const payload = await bridgeRequest(
    "me/orders",
    { auth, page: input.page, limit: input.limit },
    (value) =>
      z
        .object({
          orders: z.array(wpOrder).default([]),
          total: z.number().int().default(0),
          pages: z.number().int().default(1),
        })
        .parse(value),
  );
  return {
    orders: payload.orders.map(toOrder),
    total: payload.total,
    pages: payload.pages,
  };
}

export async function getOrder(
  auth: string,
  input: z.infer<typeof orderInput>,
): Promise<AccountOrderDetail> {
  const payload = await bridgeRequest("me/order", { auth, id: input.id }, (value) =>
    z.object({ order: wpOrderDetail }).parse(value),
  );
  const order = payload.order;
  return {
    ...toOrder(order),
    paymentMethodTitle: order.payment_method_title,
    datePaid: order.date_paid,
    dateCompleted: order.date_completed,
    customerNote: order.customer_note,
    needsPayment: order.needs_payment,
    billing: toAddress(order.billing),
    shipping: toAddress(order.shipping),
    lines: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      sku: item.sku,
      total: item.total,
      subtotal: item.subtotal,
      image: wordPressUploadUrl(item.image, publicWordPressUrl(env)),
      slug: item.permalink_slug,
    })),
    totals: order.totals,
  };
}

export async function getAddressBook(auth: string): Promise<AccountAddressBook> {
  const payload = await bridgeRequest("me/addresses", { auth }, (value) =>
    z
      .object({
        billing: wpAddress,
        shipping: wpAddress,
        countries: z.record(z.string(), z.string()).default({}),
        billing_states: z.record(z.string(), z.string()).default({}),
        shipping_states: z.record(z.string(), z.string()).default({}),
      })
      .parse(value),
  );
  return {
    billing: toAddress(payload.billing),
    shipping: toAddress(payload.shipping),
    countries: payload.countries,
    billingStates: payload.billing_states,
    shippingStates: payload.shipping_states,
  };
}

export async function saveAddress(auth: string, input: z.infer<typeof addressInput>) {
  const payload = await bridgeRequest(
    "me/address",
    { auth, type: input.kind, fields: fromAddress(input.fields) },
    (value) => z.object({ billing: wpAddress, shipping: wpAddress }).parse(value),
  );
  return {
    billing: toAddress(payload.billing),
    shipping: toAddress(payload.shipping),
  };
}

export async function updateProfile(auth: string, input: z.infer<typeof profileInput>) {
  const payload = await bridgeRequest(
    "me/update",
    {
      auth,
      first_name: input.firstName,
      last_name: input.lastName,
      display_name: input.displayName ?? "",
      email: input.email,
      current_password: input.currentPassword ?? "",
    },
    (value) => z.object({ user: wpUser }).parse(value),
  );
  // The stored name just changed, so the memo of the old one has to go.
  forgetViewer(auth);
  return toViewer(payload.user);
}

/** Changing a password rotates the session, so the caller re-issues the cookie. */
export async function changePassword(auth: string, input: z.infer<typeof passwordInput>) {
  forgetViewer(auth);
  return bridgeRequest(
    "me/password",
    {
      auth,
      current_password: input.currentPassword,
      new_password: input.newPassword,
    },
    (value) =>
      z
        .object({ auth: z.string().min(1), expires: z.number().int().positive() })
        .parse(value),
  );
}

/** Always answers ok: whether an address is registered is never disclosed. */
export async function requestPasswordReset(input: z.infer<typeof lostPasswordInput>) {
  await bridgeRequest("lost-password", { email: input.email }, () => null);
  return { ok: true as const };
}

export async function resetPassword(input: z.infer<typeof resetPasswordInput>) {
  await bridgeRequest(
    "reset-password",
    {
      key: input.key,
      login: input.login,
      id: input.id ?? 0,
      new_password: input.newPassword,
    },
    () => null,
  );
  return { ok: true as const };
}

export { emptyAddress };

/* -------------------------------------------- declaration and Facebook */

/** The research declaration for a signed-in account, made once (after a Google sign-up, for one). */
export async function saveDeclaration(
  auth: string,
  declaration: Declaration,
  source: "storefront-google" | "storefront-step",
) {
  await bridgeRequest(
    "me/declaration",
    { auth, source, declaration },
    (value) => z.object({ declared: z.boolean() }).parse(value),
  );
}

const facebookAnswer = z.discriminatedUnion("result", [
  z.object({ result: z.literal("signed_in"), new_account: z.boolean(), session: wpSession }),
  z.object({ result: z.literal("existing_email") }),
  z.object({ result: z.literal("need_more"), missing: z.array(z.enum(["email", "declaration"])) }),
]);

export type FacebookOutcome =
  | { result: "signed_in"; session: Session; newAccount: boolean }
  | { result: "existing_email" }
  | { result: "need_more"; missing: ("email" | "declaration")[] };

/**
 * Sign in or sign up with a Facebook identity this server verified.
 *
 * WordPress decides: a linked Facebook id signs in; a new email with the
 * declaration on record signs up; an email that already has an account is
 * never signed in this way; anything missing is asked for.
 */
export async function facebookSignIn(input: {
  facebookId: string;
  email: string;
  name: string;
  declaration: Declaration | null;
}): Promise<FacebookOutcome> {
  const answer = await bridgeRequest(
    "facebook-signin",
    {
      facebook_id: input.facebookId,
      email: input.email,
      name: input.name,
      ...(input.declaration ? { declaration: input.declaration } : {}),
    },
    (value) => facebookAnswer.parse(value),
  );
  if (answer.result === "signed_in") {
    return { result: "signed_in", session: toSession(answer.session), newAccount: answer.new_account };
  }
  return answer;
}
