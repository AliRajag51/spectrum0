import "server-only";

import { env } from "@/env";
import type { CartJar } from "@/lib/cart-jar";
import { storeApiHeaders } from "@/server/wordpress/client";
import {
  runCartRequest,
  storeCall,
  storeCheckout,
  type CheckoutOutcome,
  type StoreOutcome,
  type StoreRequest,
  type StoreTransportConfig,
} from "@/server/wordpress/store-transport";

/* The Store API, bound to this deployment.
 *
 * Public and unauthenticated by design, which is why every call goes out from
 * this server with the shopper's WordPress cookie jar rather than from a
 * browser. The transport itself lives in `store-transport.ts` so it can be run
 * against a fake store; this file only supplies the base URL, the budgets and
 * real `fetch`. */

export type {
  CheckoutOutcome,
  PlacedOrder,
  StoreCart,
  StoreOutcome,
  StoreRequest,
} from "@/server/wordpress/store-transport";
export {
  BUSY_MESSAGE,
  SESSION_MESSAGE,
  UNAVAILABLE_MESSAGE,
  storeCart,
} from "@/server/wordpress/store-transport";

// Reads answer from cache or a single row. Writes may wait 2 s on the cart
// lock before the site even starts, so they get a budget of their own.
const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 12_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const storeApiConfigured = () => Boolean(env.WOOCOMMERCE_URL);

function transport(): StoreTransportConfig | null {
  if (!env.WOOCOMMERCE_URL) return null;
  return {
    baseUrl: env.WOOCOMMERCE_URL,
    // The bridge key lets this server through the store's access gate.
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(storeApiHeaders())) headers.set(name, value);
      return fetch(input, { ...init, headers });
    },
    readTimeoutMs: READ_TIMEOUT_MS,
    writeTimeoutMs: WRITE_TIMEOUT_MS,
    sleep,
  };
}

const notConnected = (jar: CartJar): StoreOutcome => ({
  outcome: "unavailable",
  jar,
  message: "The store is not connected.",
});

/** One request with the retries it earns. Never throws for an upstream answer. */
export function cartRequest(jar: CartJar, request: StoreRequest): Promise<StoreOutcome> {
  const config = transport();
  return config ? runCartRequest(config, jar, request) : Promise.resolve(notConnected(jar));
}

/** One bare call, no retries. For a caller that judges the outcome itself. */
export function storeRequest(jar: CartJar, request: StoreRequest): Promise<StoreOutcome> {
  const config = transport();
  return config ? storeCall(config, jar, request) : Promise.resolve(notConnected(jar));
}

/** Place the order through WooCommerce's checkout. One call, never retried. */
export function checkoutRequest(jar: CartJar, request: StoreRequest): Promise<CheckoutOutcome> {
  const config = transport();
  if (!config) return Promise.resolve(notConnected(jar) as CheckoutOutcome);
  // Making an order takes longer than a cart write: totals, stock and the order row.
  return storeCheckout({ ...config, writeTimeoutMs: 25_000 }, jar, request);
}
