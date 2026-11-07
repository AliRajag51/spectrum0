import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Absolute origin (no trailing slash) for canonical/hreflang links, the sitemap
 * and robots.txt.
 *
 * An explicit NEXT_PUBLIC_SITE_URL always wins. Without one we fall back to the
 * host Vercel injects at build time, so a deployment whose variable has not been
 * set yet still builds with correct — if deployment-scoped — absolute URLs:
 *   production -> the project's stable production domain
 *   preview    -> this deployment's own URL
 * Off Vercel we assume local development.
 *
 * We deliberately do NOT fall back to localhost while on Vercel: emitting
 * localhost canonicals into a real deployment is worse than a failed build, so
 * that case returns undefined and env validation reports the missing variable.
 *
 * Only read on the server today (robots, sitemap, generateMetadata). It stays a
 * client var because it is NEXT_PUBLIC_-prefixed; note that if a client
 * component ever imports it, Next inlines `process.env.NEXT_PUBLIC_SITE_URL`
 * literally and the fallbacks below would not reach the browser bundle.
 */
function resolveSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.VERCEL === "1") {
    const host =
      process.env.VERCEL_ENV === "production"
        ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
        : process.env.VERCEL_URL;
    return host ? `https://${host}` : undefined;
  }

  return "http://localhost:3000";
}

export const env = createEnv({
  server: {
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    ORDER_TRACKING_ENABLED: z.enum(["true", "false"]).default("false"),
    WOOCOMMERCE_URL: z.string().url().optional(),
    // The origin the BROWSER uses for WordPress, when it differs from the one the
    // server calls (local Docker: server -> http://wordpress, browser ->
    // http://localhost:8080). Defaults to WOOCOMMERCE_URL.
    WOOCOMMERCE_PUBLIC_URL: z.string().url().optional(),
    // Optional. The catalogue reads the anonymous Store API and never uses
    // these; only the authenticated `wc/v3` and plugin routes (orders, restock
    // alerts, locations) still do.
    WOOCOMMERCE_CONSUMER_KEY: z.string().optional(),
    WOOCOMMERCE_CONSUMER_SECRET: z.string().optional(),
    WOOCOMMERCE_SHIPMENT_TRACKING: z.enum(["true", "false"]).default("false"),
    WOOCOMMERCE_CATALOG_ENABLED: z.enum(["true", "false"]).default("false"),
    WOOCOMMERCE_WEBHOOK_SECRET: z.string().min(16).optional(),
    WOOCOMMERCE_API_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(15000)
      .default(5000),
    CHECKOUT_IDEMPOTENCY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86400)
      .default(900),
    // Shared secret for NVM Headless Core. Accounts stay disabled until it is set.
    NVM_BRIDGE_KEY: z.string().min(32).optional(),
    // Seals the `pc_wp` cart jar. Falls back to NVM_BRIDGE_KEY when unset.
    CART_SESSION_KEY: z.string().min(32).optional(),
    // The agency's WordPress endpoints (contract items a-e: tasks 2, 9, 16, 17,
    // 20, 22). "on" only once their side is live on the WordPress this site uses;
    // until then every storefront piece that calls them stays switched off.
    STOREFRONT_CONTRACT: z.enum(["off", "on"]).default("off"),
    STOREFRONT_INDEXING_ENABLED: z.enum(["true", "false"]).default("false"),
  },
  client: {
    // Absolute origin (no trailing slash) for canonical links and the sitemap.
    NEXT_PUBLIC_SITE_URL: z.string().url(),
    // Cloudflare Turnstile site key for the contact form. The site plugin
    // verifies the token, so the form cannot send without one.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    // The support address the contact page shows beside the form.
    NEXT_PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
  },
  runtimeEnv: {
    VERCEL_ENV: process.env.VERCEL_ENV,
    ORDER_TRACKING_ENABLED: process.env.ORDER_TRACKING_ENABLED,
    WOOCOMMERCE_URL: process.env.WOOCOMMERCE_URL,
    WOOCOMMERCE_PUBLIC_URL: process.env.WOOCOMMERCE_PUBLIC_URL,
    WOOCOMMERCE_CONSUMER_KEY: process.env.WOOCOMMERCE_CONSUMER_KEY,
    WOOCOMMERCE_CONSUMER_SECRET: process.env.WOOCOMMERCE_CONSUMER_SECRET,
    WOOCOMMERCE_SHIPMENT_TRACKING: process.env.WOOCOMMERCE_SHIPMENT_TRACKING,
    WOOCOMMERCE_CATALOG_ENABLED: process.env.WOOCOMMERCE_CATALOG_ENABLED,
    WOOCOMMERCE_WEBHOOK_SECRET: process.env.WOOCOMMERCE_WEBHOOK_SECRET,
    WOOCOMMERCE_API_TIMEOUT_MS: process.env.WOOCOMMERCE_API_TIMEOUT_MS,
    CHECKOUT_IDEMPOTENCY_TTL_SECONDS:
      process.env.CHECKOUT_IDEMPOTENCY_TTL_SECONDS,
    NVM_BRIDGE_KEY: process.env.NVM_BRIDGE_KEY,
    CART_SESSION_KEY: process.env.CART_SESSION_KEY,
    STOREFRONT_CONTRACT: process.env.STOREFRONT_CONTRACT,
    STOREFRONT_INDEXING_ENABLED: process.env.STOREFRONT_INDEXING_ENABLED,
    NEXT_PUBLIC_SITE_URL: resolveSiteUrl(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  },
  emptyStringAsUndefined: true,
});
