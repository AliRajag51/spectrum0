import { z } from "zod";
import { absorbResponse, emptyJar, hasCartIdentity, isMemberJar, jarCookieHeader, type CartJar } from "../../lib/cart-jar.ts";
import { tokenLost } from "../../lib/cart-session.ts";
import { plainText } from "../../lib/plain-text.ts";

/* The WooCommerce Store API, spoken with the WordPress cookie jar.
 *
 * Pure on purpose: no `server-only`, no env, `fetch` injected. This is the
 * part of the cart whose behaviour under each upstream answer has to be
 * exercised with a fake store, and `store-api.ts` binds it to the deployment.
 *
 * Every call sends `Cookie: <tpc_cid>; <wp_woocommerce_session_*>` and
 * `Cart-Token` when the jar holds them, and reads back whatever the site set.
 * Nothing here throws for an upstream answer. Each call classifies the reply
 * as one of six outcomes, and `runCartRequest` decides what one more attempt
 * can fix. */

export type StoreTransportConfig = {
  baseUrl: string;
  fetch: typeof fetch;
  readTimeoutMs: number;
  writeTimeoutMs: number;
  sleep: (ms: number) => Promise<void>;
};

/* WooCommerce sends money as a decimal string in minor units, and sends `null`
   rather than omitting it for a total it has not calculated yet - shipping,
   before an address is known. A Zod default only covers `undefined`, so these
   have to be read as nullable and normalised. */
const moneyString = z
  .string()
  .nullish()
  .transform((value) => value ?? "0");

const label = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

const price = z.object({
  price: moneyString,
  regular_price: moneyString,
  currency_code: z.string().nullish().transform((value) => value || "USD"),
});

const item = z.object({
  key: z.string(),
  id: z.number().int(),
  type: z.string().default(""),
  quantity: z.number().int(),
  name: label,
  sku: label,
  prices: price,
  totals: z.object({ line_total: moneyString, line_subtotal: moneyString }),
  images: z.array(z.object({ src: label, thumbnail: label })).default([]),
  variation: z.array(z.object({ attribute: label, value: label })).default([]),
  extensions: z
    .object({
      tpc: z
        .object({
          discount_percent: z.number().default(0),
          bundle_savings: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .loose()
    .default({}),
});

/* The checkout reads these off the same cart answer. Every one is optional,
   because a cart write answers with the whole cart and the basket itself must
   not fail on a field only the checkout uses. */
const storeAddress = z
  .object({
    first_name: label,
    last_name: label,
    company: label,
    address_1: label,
    address_2: label,
    city: label,
    state: label,
    postcode: label,
    country: label,
    email: label,
    phone: label,
  })
  .partial()
  .transform((value) => ({
    first_name: value.first_name ?? "",
    last_name: value.last_name ?? "",
    company: value.company ?? "",
    address_1: value.address_1 ?? "",
    address_2: value.address_2 ?? "",
    city: value.city ?? "",
    state: value.state ?? "",
    postcode: value.postcode ?? "",
    country: value.country ?? "",
    email: value.email ?? "",
    phone: value.phone ?? "",
  }));

const shippingPackage = z.object({
  package_id: z.union([z.number(), z.string()]),
  shipping_rates: z
    .array(
      z.object({
        rate_id: z.string(),
        name: label,
        price: moneyString,
        selected: z.boolean().default(false),
        delivery_time: label,
      }),
    )
    .default([]),
});

const coupon = z.object({
  code: z.string(),
  totals: z.object({ total_discount: moneyString }).optional(),
});

export const storeCart = z.object({
  items: z.array(item).default([]),
  items_count: z.number().int().default(0),
  needs_shipping: z.boolean().default(false),
  needs_payment: z.boolean().default(true),
  coupons: z.array(coupon).default([]),
  shipping_rates: z.array(shippingPackage).default([]),
  billing_address: storeAddress.optional(),
  shipping_address: storeAddress.optional(),
  payment_methods: z.array(z.string()).default([]),
  totals: z.object({
    total_items: moneyString,
    total_price: moneyString,
    total_shipping: moneyString,
    total_discount: moneyString,
    currency_code: z.string().nullish().transform((value) => value || "USD"),
  }),
});

export type StoreCart = z.infer<typeof storeCart>;

// `tpc-store` answers its 409s with a code and no message.
const storeError = z.object({ code: z.string(), message: z.string().optional() }).loose();

export type StoreOutcome =
  /** 2xx with a valid cart. */
  | { outcome: "applied"; cart: StoreCart; jar: CartJar }
  /** 409 `tpc_cart_busy` or 429: another write holds the lock. */
  | { outcome: "busy"; jar: CartJar; retryAfterMs: number }
  /** 409 `tpc_needs_bootstrap`: the site has just issued an identity. */
  | { outcome: "bootstrap"; jar: CartJar }
  /** 401/403 with a nonce or token code: same identity, new token needed. */
  | { outcome: "token_lost"; jar: CartJar }
  /** Any other 4xx. WooCommerce's own wording, for the customer. */
  | { outcome: "refused"; jar: CartJar; status: number; message: string }
  /** 5xx, timeout, unreachable, unreadable. The jar is untouched. */
  | { outcome: "unavailable"; jar: CartJar; retryAfterMs?: number; message: string };

export const UNAVAILABLE_MESSAGE = "Your cart is unavailable right now. Please try again.";
export const TIMEOUT_MESSAGE = "Your cart timed out. Please try again.";
export const BUSY_MESSAGE = "Your cart is busy right now. Please try again in a moment.";
export const SESSION_MESSAGE = "Your cart session could not be established. Please try again.";
const REFUSED_MESSAGE = "That change could not be applied to your cart.";

// The lock answers within 2 s; nothing is gained by waiting longer than this.
const RETRY_AFTER_CAP_MS = 3_000;
const RETRY_AFTER_DEFAULT_MS = 1_000;

// Statuses the tRPC layer has a code for. Anything else is reported as 400.
const passThroughStatuses = new Set([400, 401, 403, 404, 409, 429]);

function storeUrl(baseUrl: string, route: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`wp-json/wc/store/v1/${route.replace(/^\//, "")}`, base);
}

function retryAfterMs(headers: Headers) {
  const seconds = Number(headers.get("retry-after"));
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RETRY_AFTER_DEFAULT_MS;
  return Math.min(RETRY_AFTER_CAP_MS, ms);
}

export type StoreRequest = {
  route: string;
  body?: unknown;
  /** Extra request headers, e.g. the customer's session for the checkout. */
  headers?: Record<string, string>;
};

type Exchange =
  | { done: StoreOutcome }
  | { done?: undefined; response: Response; payload: unknown; readable: boolean; jar: CartJar };

/**
 * One request and its classification up to the success body, which each
 * caller reads in its own shape: a cart for the cart routes, an order for
 * checkout. Every failure is already an outcome here.
 */
async function exchange(
  config: StoreTransportConfig,
  jar: CartJar,
  { route, body, headers: extra }: StoreRequest,
): Promise<Exchange> {
  const write = body !== undefined;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    write ? config.writeTimeoutMs : config.readTimeoutMs,
  );
  let response: Response;
  let text: string;
  try {
    const headers = new Headers({ accept: "application/json" });
    const cookie = jarCookieHeader(jar);
    if (cookie) headers.set("cookie", cookie);
    if (isMemberJar(jar)) {
      // As the member (the agency's Oct 19 notes): the header alone, no token or guest cookie.
      if (jar.auth) headers.set("x-nvm-customer-auth", jar.auth);
    } else if (jar.token) headers.set("cart-token", jar.token);
    if (write) headers.set("content-type", "application/json");
    for (const [name, value] of Object.entries(extra ?? {})) {
      // Extra cookies join the cart's; they never replace its identity.
      if (name.toLowerCase() === "cookie") {
        if (value) headers.set("cookie", cookie ? `${cookie}; ${value}` : value);
      } else headers.set(name, value);
    }
    response = await config.fetch(storeUrl(config.baseUrl, route), {
      method: write ? "POST" : "GET",
      headers,
      body: write ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { done: { outcome: "unavailable", jar, message: timedOut ? TIMEOUT_MESSAGE : UNAVAILABLE_MESSAGE } };
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  let readable = true;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      // A WordPress fatal page, or a gateway's own error body: not JSON.
      readable = false;
    }
  }

  if (response.status >= 500) {
    return {
      done: {
        outcome: "unavailable",
        jar,
        retryAfterMs: response.headers.has("retry-after") ? retryAfterMs(response.headers) : undefined,
        message: UNAVAILABLE_MESSAGE,
      },
    };
  }

  const next = absorbResponse(jar, response.headers);

  if (!response.ok) {
    const parsed = storeError.safeParse(payload);
    const code = parsed.success ? parsed.data.code : "";
    if (response.status === 429 || (response.status === 409 && code === "tpc_cart_busy")) {
      return { done: { outcome: "busy", jar: next, retryAfterMs: retryAfterMs(response.headers) } };
    }
    if (response.status === 409 && code === "tpc_needs_bootstrap") {
      return { done: { outcome: "bootstrap", jar: next } };
    }
    if (tokenLost({ status: response.status, code })) {
      return { done: { outcome: "token_lost", jar: next } };
    }
    /* WooCommerce's own wording is written for customers - "this product cannot
       be purchased", a stock limit - so it is carried through rather than
       replaced with something vaguer. */
    return {
      done: {
        outcome: "refused",
        jar: next,
        status: passThroughStatuses.has(response.status) ? response.status : 400,
        message: (parsed.success && parsed.data.message ? plainText(parsed.data.message) : "") || REFUSED_MESSAGE,
      },
    };
  }

  return { response, payload, readable, jar: next };
}

/**
 * One Store API call, classified.
 *
 * The jar in the answer already carries whatever the site set, except on
 * `unavailable`: a store that is down has said nothing about the session, so
 * the jar it is handed back is the one it was given.
 */
export async function storeCall(
  config: StoreTransportConfig,
  jar: CartJar,
  request: StoreRequest,
): Promise<StoreOutcome> {
  const result = await exchange(config, jar, request);
  if (result.done) return result.done;
  const cart = result.readable ? storeCart.safeParse(result.payload) : null;
  if (!cart?.success) {
    return { outcome: "unavailable", jar, message: UNAVAILABLE_MESSAGE };
  }
  return { outcome: "applied", cart: cart.data, jar: result.jar };
}

/* The Store API checkout's answer: the order WooCommerce has just made. */
const placedOrder = z
  .object({
    order_id: z.number().int().positive(),
    order_key: z.string().min(1),
    order_number: z.union([z.string(), z.number()]).transform(String).optional(),
    status: z.string(),
    payment_method: z.string().nullish(),
    payment_result: z.object({ payment_status: z.string() }).loose().nullish(),
  })
  .loose();

export type PlacedOrder = z.infer<typeof placedOrder>;

export type CheckoutOutcome =
  | { outcome: "placed"; order: PlacedOrder; jar: CartJar }
  | Exclude<StoreOutcome, { outcome: "applied" }>;

/**
 * Place the order for this cart through WooCommerce's own checkout.
 *
 * Never retried: an order request that timed out may have made the order, and
 * a second one would make another. The caller reports the outcome instead.
 */
export async function storeCheckout(
  config: StoreTransportConfig,
  jar: CartJar,
  request: StoreRequest,
): Promise<CheckoutOutcome> {
  const result = await exchange(config, jar, request);
  if (result.done) {
    // The success shape is the only one that differs; failures are the cart's.
    return result.done.outcome === "applied"
      ? { outcome: "unavailable", jar, message: UNAVAILABLE_MESSAGE }
      : result.done;
  }
  const order = result.readable ? placedOrder.safeParse(result.payload) : null;
  if (!order?.success) {
    return { outcome: "unavailable", jar: result.jar, message: UNAVAILABLE_MESSAGE };
  }
  return { outcome: "placed", order: order.data, jar: result.jar };
}

const read = (jar: CartJar): CartJar => ({ ...jar, token: undefined });

/* Two jars from the bootstrap pair, merged. The write's answer names the
   identity and wins on every field it set; the read's answer fills the token. */
function merge(primary: CartJar, secondary: CartJar): CartJar {
  return {
    ...primary,
    cid: primary.cid ?? secondary.cid,
    wcs: primary.wcs ?? secondary.wcs,
    token: primary.token ?? secondary.token,
  };
}

/**
 * One cart request, with the one retry each outcome earns.
 *
 * A first write from a shopper with no identity opens with two calls at once:
 * `GET /cart` for a token, and the real write, which the site refuses with a
 * fresh `tpc_cid`. Then the write goes again with both. From there each
 * non-final outcome buys exactly one more attempt of its kind. `busy` waits
 * out `Retry-After`, `bootstrap` stores the identity, `token_lost` reads the
 * cart with the jar's cookies for a new token, and in every case the identical
 * request is resent, which the site guarantees is safe. A second occurrence of
 * the same outcome ends the attempt rather than looping.
 *
 * The answer is the last outcome seen, so a caller can tell a refusal from an
 * outage from a lock that never cleared.
 */
export async function runCartRequest(
  config: StoreTransportConfig,
  jar: CartJar,
  request: StoreRequest,
): Promise<StoreOutcome> {
  const result = await runLadder(config, jar, request);

  /*
   * A jar the site keeps refusing is a dead one, and it is dropped.
   *
   * The identity in a jar can stop being real without this server hearing:
   * WooCommerce migrates a guest cart into the account on sign in, the
   * checkout handoff moves it to a new session, and a tpc_cid simply expires
   * after thirty days. The ladder above then presents that identity, is told
   * to bootstrap, presents it again with a fresh token, and is refused again,
   * and the shopper reads "your cart session could not be established, please
   * try again" on every click until they clear their cookies - which trying
   * again does not do. Reproduced on production with a jar carrying an id the
   * site never issued: 503, twice, for as long as the cookie lasted.
   *
   * A first-time visitor with no jar at all walks straight in, so that is
   * what a shopper with a dead one becomes. The basket behind the dead id
   * was unreachable already; nothing that could have been kept is lost.
   */
  const refused = result.outcome === "bootstrap" || result.outcome === "token_lost";
  if (refused && hasCartIdentity(jar) && request.body !== undefined) {
    return runLadder(config, emptyJar(), request);
  }
  return result;
}

async function runLadder(
  config: StoreTransportConfig,
  jar: CartJar,
  request: StoreRequest,
): Promise<StoreOutcome> {
  const isRead = request.body === undefined;
  const budget = { busy: 1, bootstrap: 1, tokenLost: 1 };
  let current = jar;
  let result: StoreOutcome;

  // A member's basket is found by the member header: there is nothing to bootstrap.
  if (!hasCartIdentity(current) && !isMemberJar(current) && !isRead) {
    const [opening, write] = await Promise.all([
      storeCall(config, read(current), { route: "cart" }),
      storeCall(config, current, request),
    ]);
    // Read-side identity only fills gaps: the write is what the site answered.
    const learned = opening.outcome === "applied" ? opening.jar : current;
    result =
      write.outcome === "unavailable"
        ? write
        : { ...write, jar: merge(write.jar, learned) };
    if (result.outcome === "bootstrap") {
      budget.bootstrap = 0;
      current = result.jar;
      result = await storeCall(config, current, request);
    }
  } else {
    result = await storeCall(config, current, request);
  }

  for (;;) {
    switch (result.outcome) {
      case "applied":
      case "refused":
      case "unavailable":
        return result;

      case "busy": {
        if (budget.busy-- <= 0) return result;
        await config.sleep(result.retryAfterMs);
        current = result.jar;
        result = await storeCall(config, current, request);
        continue;
      }

      case "bootstrap": {
        if (budget.bootstrap-- <= 0) return result;
        current = result.jar;
        if (!current.token && !isRead) {
          const opening = await storeCall(config, read(current), { route: "cart" });
          if (opening.outcome === "applied") current = merge(current, opening.jar);
        }
        result = await storeCall(config, current, request);
        continue;
      }

      case "token_lost": {
        if (budget.tokenLost-- <= 0) return result;
        // The rejected token stays home: WooCommerce refuses a read that
        // carries one it cannot validate, and the point is a fresh one.
        const opening = await storeCall(config, read(result.jar), { route: "cart" });
        if (opening.outcome !== "applied") {
          return opening.outcome === "unavailable"
            ? opening
            : { outcome: "unavailable", jar: result.jar, message: SESSION_MESSAGE };
        }
        current = merge(opening.jar, result.jar);
        if (isRead) return { ...opening, jar: current };
        result = await storeCall(config, current, request);
        continue;
      }
    }
  }
}
