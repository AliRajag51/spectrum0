import "server-only";

import { env } from "@/env";

/**
 * Whether search engines may index this deployment.
 *
 * Both conditions are required: the flag says the shop is ready to be found,
 * and VERCEL_ENV says this build is the one on the real domain. A preview that
 * inherits the production flag by mistake still answers noindex.
 */
export const indexingEnabled = (): boolean =>
  env.STOREFRONT_INDEXING_ENABLED === "true" && env.VERCEL_ENV === "production";

/** Paths that are per-shopper or transactional and never belong in search. */
export const PRIVATE_PATHS = ["/account", "/cart", "/checkout", "/track-order", "/api/"];
