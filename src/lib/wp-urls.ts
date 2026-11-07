/* Guards for URLs that arrive from WordPress.

   WooCommerce hands back absolute URLs it built itself, and both of these end
   up somewhere a wrong value is expensive: one becomes a browser redirect after
   an order is created, the other is handed to the Next.js image optimiser,
   which throws for a host it was not configured with. Both are checked against
   the configured store origin rather than trusted. */

function parsePair(value: string, baseUrl: string) {
  try {
    return { url: new URL(value), base: new URL(baseUrl) };
  } catch {
    return null;
  }
}

/* A host that cannot be on the public internet: the loopback name or a bare
   single-label name such as a Docker service. Plain HTTP is tolerated only
   there, so the production rule stays HTTPS-only. */
function internalHost(hostname: string) {
  return hostname === "localhost" || !hostname.includes(".");
}

/** The origin the browser should use for WordPress. */
export function publicWordPressUrl(env: {
  WOOCOMMERCE_URL?: string;
  WOOCOMMERCE_PUBLIC_URL?: string;
}) {
  return env.WOOCOMMERCE_PUBLIC_URL || env.WOOCOMMERCE_URL;
}

/**
 * A URL on the configured store that is safe to navigate a browser to.
 *
 * Same host, HTTPS (or plain HTTP to an internal host), and no embedded credentials. Guards both of the upstream
 * strings the storefront turns into a navigation: WooCommerce's pay-for-order
 * URL and the bridge's single-use handoff URL.
 */
export function wordPressStoreUrl(
  value: string | undefined | null,
  baseUrl: string | undefined,
) {
  if (!value || !baseUrl) return undefined;
  const parsed = parsePair(value, baseUrl);
  if (!parsed) return undefined;
  const { url, base } = parsed;
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && base.protocol === "http:" && internalHost(url.hostname));
  return secure &&
    url.host === base.host &&
    !url.username &&
    !url.password
    ? url.href
    : undefined;
}

/**
 * An attachment URL inside the uploads directory, or an empty string.
 *
 * `next.config.ts` allows exactly this host and path prefix, so anything else
 * would throw during render; an empty result renders the item placeholder.
 */
export function wordPressUploadUrl(
  value: string | undefined | null,
  baseUrl: string | undefined,
) {
  if (!value || !baseUrl) return "";
  const parsed = parsePair(value, baseUrl);
  if (!parsed) return "";
  const { url, base } = parsed;
  return url.host === base.host && url.pathname.startsWith("/wp-content/uploads/")
    ? url.href
    : "";
}
