import "server-only";

import { env } from "@/env";
import { cachedStorefrontCheckoutSetting } from "@/lib/storefront-gate-policy";

/**
 * Whether the Checkout button opens the storefront's own checkout.
 *
 * Headless Core decides ("Use the storefront's own checkout", WooCommerce →
 * Headless Core), not a deployment variable, so switching is one saved
 * setting (the agency, Oct 26). Off, unreadable, or an older core all mean the
 * WordPress checkout: it is the one that has Apple Pay on peptidescollective.com,
 * and it needs WordPress anyway.
 */
export async function storefrontCheckoutOn(): Promise<boolean> {
  if (!env.WOOCOMMERCE_URL || !env.NVM_BRIDGE_KEY) return false;
  try {
    return await cachedStorefrontCheckoutSetting(
      env.WOOCOMMERCE_URL,
      env.NVM_BRIDGE_KEY,
      env.WOOCOMMERCE_API_TIMEOUT_MS,
    );
  } catch {
    return false;
  }
}
