/* Hosts that share one sign-in and basket, and the parent domain they share
   it on. Empty: Spectrum serves one host, so cookies stay host-only. Add the
   pair here if the storefront ever answers on more than one subdomain. */
const SHARED_HOSTS: Record<string, string> = {};

/** Share storefront state between a pair of language hosts only. */
export function storefrontCookieDomain(siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production"
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? ""}`
    : undefined
)) {
  try {
    const url = new URL(siteUrl ?? "");
    return url.protocol === "https:" ? SHARED_HOSTS[url.hostname] : undefined;
  } catch {
    return undefined;
  }
}

/** The host a request was made to, as the middleware reads it: no port, lower case. */
export function requestHost(headers: Headers) {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "")
    .split(",", 1)[0]!.trim().replace(/:\d+$/, "").toLowerCase();
}

/**
 * The Domain for cookies written in answer to a request on `host`.
 *
 * `storefrontCookieDomain()` reads the configured site URL, but one deployment
 * answers on more than that URL: the staging app has the production site URL
 * and is browsed on its vercel.app address, where a cookie for
 * peptidescollective.com is refused outright. Sign-in then "succeeds" and the
 * browser keeps no session. So when the request's host is known it decides:
 * the shared domain only on the two language hosts that share it. Without a
 * host the configured answer stands.
 */
export function cookieDomainFor(host?: string | null) {
  if (host === undefined || host === null) return storefrontCookieDomain();
  return SHARED_HOSTS[host];
}

/**
 * Expire the same cookies in the scope they used to be written in.
 *
 * Storefront cookies used to be host-only. They are now written for the parent
 * domain so www and es share one basket. A browser that visited before that
 * change holds BOTH: the old host-only cookie and the new domain one, under the
 * same name. `readCookie` takes the first match, and browsers send duplicates
 * oldest first, so for every returning customer the stale copy wins every read
 * while every write lands on the copy nothing reads. The basket shows whatever
 * it held before, then empties the moment that stale identity stops validating.
 *
 * A Set-Cookie carrying Domain cannot delete a host-only cookie, so the old
 * scope has to be expired explicitly, by name, with no Domain attribute.
 *
 * Only when a domain is configured, which is exactly when the response also
 * writes the replacement. Where it is not configured the host-only cookie IS
 * the live one and must be left alone.
 */
export function legacyHostScopeClearHeaders(
  names: string[],
  secure: boolean,
  host?: string | null,
) {
  if (!cookieDomainFor(host)) return [];
  return names.map(
    (name) =>
      `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`,
  );
}
