import "server-only";

import { env } from "@/env";

/**
 * WooCommerce's free-shipping threshold, in dollars, or null when there is none.
 *
 * NVM Headless Core publishes the store's real rule at the public
 * `/nvm/v1/shipping-rule` route (read straight from the shipping zone), so the
 * cart's "you're $X away" meter can never promise a different number from the
 * one WooCommerce charges by. Cached for five minutes; the bridge itself
 * invalidates its answer whenever a zone changes.
 */
export async function getFreeShippingThreshold(): Promise<number | null> {
  if (!env.WOOCOMMERCE_URL) return null;
  try {
    const response = await fetch(
      `${env.WOOCOMMERCE_URL}/wp-json/nvm/v1/shipping-rule`,
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(env.WOOCOMMERCE_API_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const rule = (await response.json()) as {
      enabled?: unknown;
      min_amount?: unknown;
    };
    const amount = Number(rule.min_amount);
    return rule.enabled === true && Number.isFinite(amount) && amount > 0
      ? amount
      : null;
  } catch {
    // An unreachable store hides the meter rather than showing a guess.
    return null;
  }
}
