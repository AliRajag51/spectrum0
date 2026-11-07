import "server-only";

import { z } from "zod";
import { versionAtLeast } from "@/lib/checkout";
import { bridgeRequest } from "@/server/wordpress/bridge";

/* The WooCommerce order behind a storefront payment.
 *
 * WooCommerce makes the order (`placeOrder`, through its own checkout); these
 * are the two reports that follow it, through NVM Headless Core 2.5.0:
 * the payment went through, or it did not. */

/** The bridge release that makes orders for the storefront checkout. */
const ORDERS_SINCE = [2, 5, 0];
const HEALTH_TTL_MS = 60_000;

const health = z.object({ core_version: z.string().nullish() }).loose();

let known: { connected: boolean; at: number } | null = null;

/**
 * Whether WordPress can make orders for this checkout: the installed bridge
 * is 2.5.0 or later. Asked at most once a minute, so uploading the plugin
 * switches the checkout over within a minute, with no deployment.
 */
export async function ordersConnected(): Promise<boolean> {
  if (known && Date.now() - known.at < HEALTH_TTL_MS) return known.connected;
  try {
    const result = await bridgeRequest("health", {}, (value) => health.parse(value));
    known = { connected: versionAtLeast(result.core_version ?? "0", ORDERS_SINCE), at: Date.now() };
  } catch {
    // Unknown is not connected: no payment is taken without somewhere to record it.
    known = { connected: false, at: Date.now() };
  }
  return known.connected;
}

const orderState = z.object({
  order_id: z.number().int().positive(),
  order_number: z.string(),
  status: z.string(),
  paid: z.boolean(),
});

export type OrderRef = { auth: string; orderId: number; orderKey: string };

/** Mark the order paid. Idempotent for the same payment; refused if the amount differs. */
export function completeOrder(
  ref: OrderRef & { paymentId: string; amount: number; currency: string },
) {
  return bridgeRequest(
    "checkout/complete",
    {
      auth: ref.auth,
      order_id: ref.orderId,
      order_key: ref.orderKey,
      payment_id: ref.paymentId,
      amount: ref.amount,
      currency: ref.currency,
    },
    (value) => orderState.parse(value),
  );
}

/** Mark the order failed after a declined payment, as any gateway would. */
export function failOrder(ref: OrderRef & { paymentId?: string }) {
  return bridgeRequest(
    "checkout/fail",
    {
      auth: ref.auth,
      order_id: ref.orderId,
      order_key: ref.orderKey,
      payment_id: ref.paymentId ?? "",
    },
    (value) => orderState.parse(value),
  );
}
