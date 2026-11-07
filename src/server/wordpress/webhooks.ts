import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { env } from "@/env";
import { invalidatePublicTags } from "@/server/cache";
import { createInvalidationWindow } from "@/lib/invalidation-window";
import {
  invalidationForWebhook,
  type WebhookInvalidation,
} from "@/server/wordpress/webhook-topics";

const seen = new Map<string, number>();
const seenTtlMs = 10 * 60_000;

function signatureFor(body: string) {
  if (!env.WOOCOMMERCE_WEBHOOK_SECRET) return null;
  return createHmac("sha256", env.WOOCOMMERCE_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");
}

export function verifyWooWebhook(body: string, signature: string | null) {
  const expected = signatureFor(body);
  if (!expected || !signature) return false;
  const actual = Buffer.from(signature, "base64");
  const wanted = Buffer.from(expected, "base64");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/* Keyed on the delivery id, which WooCommerce mints per attempt. The webhook
   id is the same for every delivery of one webhook, so keying on it would
   silence every update after the first for ten minutes. */
export function rememberWebhook(id: string) {
  const now = Date.now();
  for (const [key, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(key);
  }
  if (seen.has(id)) return false;
  seen.set(id, now + seenTtlMs);
  return true;
}

/* A burst of product changes refreshes the catalogue every 30 seconds at most,
   not once per change (see invalidation-window). A single edit still shows at
   once. Shorter than the webhook route maxDuration, so the held refresh runs. */
const REFRESH_WINDOW_MS = 30_000;
const holder = globalThis as typeof globalThis & {
  __tpcWebhookRefresh?: ReturnType<typeof createInvalidationWindow>;
};
const refresh = (holder.__tpcWebhookRefresh ??= createInvalidationWindow({
  windowMs: REFRESH_WINDOW_MS,
  flush: invalidatePublicTags,
  hold: (work) => after(() => work),
}));

export function invalidateForWooWebhook(
  topic: string | null,
  body: string,
): WebhookInvalidation {
  const decision = invalidationForWebhook(topic, body);
  if (decision.kind === "product" || decision.kind === "report")
    refresh.add(decision.tags);
  return decision;
}
