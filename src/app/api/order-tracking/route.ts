import { NextResponse } from "next/server";
import { env } from "@/env";
import { trackingInputSchema } from "@/lib/order-tracking";
import { createLookupLimiter, lookupWooOrder } from "@/server/order-tracking";

export const runtime = "nodejs";
const allowLookup = createLookupLimiter();
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next may use its bind address in request.url; Host retains the browser's host.
  const host = request.headers.get("host") || new URL(request.url).host;
  let validOrigin = true;
  if (origin) {
    try {
      const source = new URL(origin);
      validOrigin =
        source.host === host &&
        (source.protocol === "https:" || source.protocol === "http:");
    } catch {
      validOrigin = false;
    }
  }
  if (!validOrigin || request.headers.get("sec-fetch-site") === "cross-site")
    return reply(
      { message: "Please use the tracking form on this site." },
      403,
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return reply({ message: "Invalid lookup request." }, 415);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048)
      return reply({ message: "Invalid lookup request." }, 413);
    body = JSON.parse(text);
  } catch {
    return reply(
      { message: "Enter your order number and billing email." },
      400,
    );
  }
  const parsed = trackingInputSchema.safeParse(body);
  if (!parsed.success)
    return reply(
      { message: "Check your order number and billing email." },
      400,
    );
  // No external request is made until explicitly configured and enabled.
  if (
    env.ORDER_TRACKING_ENABLED !== "true" ||
    !env.WOOCOMMERCE_URL ||
    !env.WOOCOMMERCE_CONSUMER_KEY ||
    !env.WOOCOMMERCE_CONSUMER_SECRET
  ) {
    return reply(
      {
        message:
          "Live order lookup is not connected yet. Contact our team for an order update, or view the example below.",
      },
      503,
    );
  }
  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (
    !allowLookup(`client:${client}`) ||
    !allowLookup(`order:${parsed.data.orderNumber}`)
  )
    return reply(
      { message: "Too many lookups. Please wait a minute and try again." },
      429,
    );
  try {
    const order = await lookupWooOrder(parsed.data, {
      url: env.WOOCOMMERCE_URL,
      consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
      consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET,
      shipmentTracking: env.WOOCOMMERCE_SHIPMENT_TRACKING === "true",
    });
    if (!order)
      return reply(
        {
          message:
            "We couldn’t match those details. Check the order number and billing email in your confirmation.",
        },
        404,
      );
    return reply({ order });
  } catch {
    return reply(
      {
        message:
          "Order lookup is temporarily unavailable. Please try again shortly or contact our team.",
      },
      502,
    );
  }
}
