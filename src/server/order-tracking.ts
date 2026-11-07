import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  trackingInputSchema,
  type TrackingInput,
  type TrackedOrder,
} from "../lib/order-tracking.ts";

export type WooTrackingConfig = {
  url: string;
  consumerKey: string;
  consumerSecret: string;
  shipmentTracking: boolean;
};
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const orderSchema = z.object({
  id: z.number().int().positive(),
  number: z.string(),
  status: z.enum([
    "pending",
    "on-hold",
    "processing",
    "completed",
    "cancelled",
    "refunded",
    "failed",
  ]),
  date_created_gmt: z.string().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  total: money,
  billing: z.object({ email: z.string() }),
  line_items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int().positive(),
      total: money,
    }),
  ),
});
const shipmentSchema = z.array(
  z.object({
    tracking_provider: z.string(),
    tracking_number: z.string(),
    tracking_link: z.string(),
  }),
);

export function safeTrackingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function lookupWooOrder(
  input: TrackingInput,
  config: WooTrackingConfig,
  request: typeof fetch = fetch,
): Promise<TrackedOrder | null> {
  const lookup = trackingInputSchema.parse(input);
  const base = new URL(
    config.url.endsWith("/") ? config.url : `${config.url}/`,
  );
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Invalid WooCommerce configuration");
  const headers = {
    Authorization: `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64")}`,
    Accept: "application/json",
  };
  const options: RequestInit = {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  };
  const response = await request(
    new URL(`wp-json/wc/v3/orders/${lookup.orderNumber}`, base),
    options,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Order service unavailable");
  const order = orderSchema.parse(await response.json());
  const digest = (email: string) =>
    createHash("sha256").update(email.trim().toLowerCase()).digest();
  if (
    order.id !== Number(lookup.orderNumber) ||
    !timingSafeEqual(digest(order.billing.email), digest(lookup.email))
  )
    return null;

  const record: TrackedOrder = {
    number: order.number,
    status: order.status,
    placedAt: order.date_created_gmt
      ? `${order.date_created_gmt.replace(/Z$/, "")}Z`
      : null,
    currency: order.currency,
    total: order.total,
    items: order.line_items.map(({ name, quantity, total }) => ({
      name,
      quantity,
      total,
    })),
    shipments: [],
  };
  // Optional official Woo Shipment Tracking extension. Never query until the email matches.
  if (config.shipmentTracking) {
    try {
      const tracking = await request(
        new URL(
          `wp-json/wc-shipment-tracking/v3/orders/${order.id}/shipment-trackings`,
          base,
        ),
        { ...options, signal: AbortSignal.timeout(5000) },
      );
      if (tracking.ok) {
        const shipments = shipmentSchema.parse(await tracking.json());
        record.shipments = shipments.flatMap((shipment) => {
          const url = safeTrackingUrl(shipment.tracking_link);
          return url
            ? [
                {
                  carrier: shipment.tracking_provider,
                  number: shipment.tracking_number,
                  url,
                },
              ]
            : [];
        });
      }
    } catch {
      /* Order status remains usable when the carrier extension is unavailable. */
    }
  }
  return record;
}

// Bounded per-process protection for the local/single-instance adapter.
// Replace with shared storage / edge rate limits before a multi-instance launch.
export function createLookupLimiter(limit = 6, windowMs = 60_000) {
  const attempts = new Map<string, { count: number; expires: number }>();
  return (identity: string, now = Date.now()) => {
    for (const [key, value] of attempts)
      if (value.expires <= now) attempts.delete(key);
    const key = createHash("sha256").update(identity).digest("hex");
    const current = attempts.get(key);
    if (!current) {
      if (attempts.size >= 5000) return false;
      attempts.set(key, { count: 1, expires: now + windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}
