import { NextResponse } from "next/server";
import {
  invalidateForWooWebhook,
  rememberWebhook,
  verifyWooWebhook,
} from "@/server/wordpress/webhooks";

export const runtime = "nodejs";
// A burst of changes holds one grouped refresh for up to 30 s (webhooks.ts).
export const maxDuration = 60;

/* Signature first, on the raw body, before anything is parsed. A verified
   delivery is remembered by its delivery id so WooCommerce's retries do not
   refresh the catalogue twice; a sender without one (the plugin's own
   `tpc.product`, if it sends none) is simply processed, since a repeated
   revalidation costs one upstream read and nothing else. */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ message: "Webhook payload is too large." }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > 1_000_000) {
    return NextResponse.json({ message: "Webhook payload is too large." }, { status: 413 });
  }
  if (!verifyWooWebhook(body, request.headers.get("x-wc-webhook-signature"))) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 401 });
  }
  const deliveryId = request.headers.get("x-wc-webhook-delivery-id");
  if (deliveryId && !rememberWebhook(deliveryId)) {
    return new NextResponse(null, { status: 204 });
  }
  const decision = invalidateForWooWebhook(
    request.headers.get("x-wc-webhook-topic"),
    body,
  );
  if (decision.kind === "malformed") {
    return NextResponse.json({ message: decision.message }, { status: 400 });
  }
  return new NextResponse(null, { status: 204 });
}
