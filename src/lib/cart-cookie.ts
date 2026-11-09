import { createHmac, timingSafeEqual } from "node:crypto";
import { cookieDomainFor, legacyHostScopeClearHeaders } from "./storefront-cookie-domain.ts";

/* The three cookies that carry the basket.
 *
 * `pc_wp` is the WordPress cookie jar: the site's `tpc_cid` identity, the
 * WooCommerce session cookie and the Store API token, sealed with AES-GCM
 * (see `cart-jar.ts`). It is the basket credential: HttpOnly, never in
 * localStorage, never in a URL, never read by client JavaScript.
 *
 * `wc_cart_owner` binds that jar to whoever held it. A member's basket must not
 * still be presented after they sign out, and the jar alone cannot say who it
 * belongs to, so the binding is an HMAC over the auth credential.
 *
 * `pc_cart` is a readable count so the header badge renders before the first
 * cart read lands. It is display state; nothing is authorized from it. */

import { CART_HINT_COOKIE } from "./cart-hint.ts";
import {
  CART_JAR_COOKIE,
  CART_JAR_TTL_SECONDS,
  decodeJar,
  encodeJar,
  hasCartIdentity,
  isMemberJar,
  type CartJar,
} from "./cart-jar.ts";

export const CART_OWNER_COOKIE = "wc_cart_owner";
export { CART_HINT_COOKIE, CART_JAR_COOKIE };

const isSecure = () => process.env.NODE_ENV === "production";

function attributes(maxAge: number, httpOnly: boolean, host?: string | null) {
  const domain = cookieDomainFor(host);
  return [
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(httpOnly ? ["HttpOnly"] : []),
    "SameSite=Lax",
    ...(domain ? [`Domain=${domain}`] : []),
    ...(isSecure() ? ["Secure"] : []),
  ].join("; ");
}

function digest(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("base64url");
}

/** Who this basket belongs to: the signed-in credential, or the guest. */
export const cartOwnerDigest = (secret: string, auth: string | null) =>
  digest(secret, "owner", auth || "guest");

export function readCookie(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1 || trimmed.slice(0, separator) !== name) continue;
    const value = trimmed.slice(separator + 1);
    return value || null;
  }
  return null;
}

function sameDigest(held: string, expected: string) {
  const a = Buffer.from(held);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether the browser may keep using the jar it holds.
 *
 * A browser that has never been bound is adopted on its next write rather than
 * having its basket taken away, so an existing visitor is not punished for
 * arriving before this cookie existed. A binding that does not match is a
 * different account, and that basket is not theirs to see.
 *
 * The one crossing that is allowed is a guest signing in. They chose those
 * items minutes ago and the account they just proved is their own, so the
 * basket follows them into it; taking it away at the moment they authenticate
 * is how a customer arrives at checkout to find nothing there. It is only ever
 * that direction. A basket bound to a member is refused to a guest and to any
 * other member, because on a shared browser that is someone else's selection.
 */
export function cartOwnerMatches(
  cookieHeader: string | null | undefined,
  auth: string | null,
  secret: string,
) {
  const held = readCookie(cookieHeader, CART_OWNER_COOKIE);
  if (!held) return true;
  if (sameDigest(held, cartOwnerDigest(secret, auth))) return true;
  return Boolean(auth) && sameDigest(held, cartOwnerDigest(secret, null));
}

/** Whether the request carries a jar at all, whoever it belongs to. */
export const holdsCartJar = (cookieHeader: string | null | undefined) =>
  Boolean(readCookie(cookieHeader, CART_JAR_COOKIE));

/** The jar this request may use, or null when there is none or it is not theirs. */
export function readCartJar(
  cookieHeader: string | null | undefined,
  auth: string | null,
  secret: string,
): CartJar | null {
  if (!cartOwnerMatches(cookieHeader, auth, secret)) return null;
  const jar = decodeJar(readCookie(cookieHeader, CART_JAR_COOKIE), secret);
  // A member jar has no guest identity by design; the owner binding above
  // already refused it to anyone but that member.
  return hasCartIdentity(jar) || (isMemberJar(jar) && Boolean(auth)) ? jar : null;
}

export type CartHint = { version: 1; count: number; verifiedAt: number };

export const serializeCartHint = (hint: CartHint) =>
  encodeURIComponent(JSON.stringify(hint));

export function cartCookieHeaders({
  jar,
  auth,
  count,
  secret,
  now = Date.now(),
  host,
}: {
  jar: CartJar;
  auth: string | null;
  count: number;
  secret: string;
  now?: number;
  /** The request's host; it decides the cookie Domain (see `cookieDomainFor`). */
  host?: string | null;
}) {
  const hint = serializeCartHint({ version: 1, count, verifiedAt: now });
  return [
    // The old host-only copies go first, so a browser that holds both stops
    // shadowing the ones written below on the very next request.
    ...legacyHostScopeClearHeaders(CART_COOKIE_NAMES, isSecure(), host),
    `${CART_JAR_COOKIE}=${encodeJar({ ...jar, count }, secret)}; ${attributes(CART_JAR_TTL_SECONDS, true, host)}`,
    `${CART_OWNER_COOKIE}=${cartOwnerDigest(secret, auth)}; ${attributes(CART_JAR_TTL_SECONDS, true, host)}`,
    `${CART_HINT_COOKIE}=${hint}; ${attributes(CART_JAR_TTL_SECONDS, false, host)}`,
  ];
}

export const CART_COOKIE_NAMES = [
  CART_JAR_COOKIE,
  CART_OWNER_COOKIE,
  CART_HINT_COOKIE,
];

export function clearedCartCookieHeaders({ host }: { host?: string | null } = {}) {
  return [
    ...legacyHostScopeClearHeaders(CART_COOKIE_NAMES, isSecure(), host),
    `${CART_JAR_COOKIE}=; ${attributes(0, true, host)}`,
    `${CART_OWNER_COOKIE}=; ${attributes(0, true, host)}`,
    `${CART_HINT_COOKIE}=; ${attributes(0, false, host)}`,
  ];
}
