/* The session cookie, kept free of server-only imports so its encoding and its
   attributes can be exercised directly by the test suite.

   The value is the `logged_in` auth cookie WordPress minted for the customer.
   It is a bearer credential: HttpOnly so client JavaScript can never read it,
   SameSite=Lax so it does not ride along on a cross-site POST, and Secure
   outside development. It is never logged and never put in a URL. */

import { randomUUID } from "node:crypto";
import { cookieDomainFor, legacyHostScopeClearHeaders } from "./storefront-cookie-domain.ts";
import {
  IDENTITY_COOKIE,
  NAME_COOKIE,
  serializeIdentityHint,
  type IdentityStatus,
} from "./identity-hint.ts";

export const SESSION_COOKIE = "ssb_session";

const MAX_LIFETIME_SECONDS = 30 * 86_400;

/* WordPress auth cookies are `login|expiry|token|hmac`, and the login segment
   is user-controlled, so the value is base64url encoded rather than trusted to
   be cookie-safe. Decoding re-checks the shape, so a tampered or truncated
   cookie is treated as absent instead of being sent upstream. */
export const encodeSessionValue = (auth: string) =>
  Buffer.from(auth, "utf8").toString("base64url");

export function decodeSessionValue(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const auth = Buffer.from(value, "base64url").toString("utf8");
  return /^[\x20-\x7e]+$/.test(auth) && auth.split("|").length === 4 ? auth : null;
}

const isSecure = () => process.env.NODE_ENV === "production";

/* A null `maxAge` is a browser-session cookie: no Max-Age, so the browser drops
   it on close. That is "Keep me signed in" left unticked. */
function attributes(maxAge: number | null, secure: boolean, host?: string | null) {
  const domain = cookieDomainFor(host);
  return [
    "Path=/",
    ...(maxAge === null ? [] : [`Max-Age=${maxAge}`]),
    "HttpOnly",
    "SameSite=Lax",
    ...(domain ? [`Domain=${domain}`] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * What every writer below takes. `host` is the request's host (`requestHost`)
 * and decides the cookie Domain; `persistent: false` is "Keep me signed in"
 * left unticked.
 */
export type CookieOptions = { now?: number; persistent?: boolean; host?: string | null };

/** `Set-Cookie` for a session the bridge just issued. */
export function sessionCookieHeader(
  auth: string,
  expires: number,
  { now = Date.now(), persistent = true, host }: CookieOptions = {},
) {
  // The upstream expiry is authoritative; the cookie never outlives the session.
  const maxAge = Math.max(
    60,
    Math.min(MAX_LIFETIME_SECONDS, expires - Math.floor(now / 1000)),
  );
  return `${SESSION_COOKIE}=${encodeSessionValue(auth)}; ${attributes(persistent ? maxAge : null, isSecure(), host)}`;
}

/** `Set-Cookie` that removes the session. */
export function clearedSessionCookieHeader({ host }: CookieOptions = {}) {
  return `${SESSION_COOKIE}=; ${attributes(0, isSecure(), host)}`;
}

/* The two readable companions to the session cookie.
 *
 * Neither is HttpOnly, on purpose: the header names the customer from `pc_name`
 * without a request per page, and the cart compares `pc_identity`'s generation
 * to notice that the account using this browser changed. Both are display
 * state, both are editable by the browser, and no server reads either to
 * decide anything. */

function displayAttributes(maxAge: number | null, host?: string | null) {
  const domain = cookieDomainFor(host);
  return [
    "Path=/",
    ...(maxAge === null ? [] : [`Max-Age=${maxAge}`]),
    "SameSite=Lax",
    ...(domain ? [`Domain=${domain}`] : []),
    ...(isSecure() ? ["Secure"] : []),
  ].join("; ");
}

export function displayCookieHeaders(
  status: IdentityStatus,
  expires: number,
  name = "",
  { now = Date.now(), persistent = true, host }: CookieOptions = {},
) {
  const maxAge = Math.max(
    0,
    Math.min(MAX_LIFETIME_SECONDS, expires - Math.floor(now / 1000)),
  );
  const hint = serializeIdentityHint({
    version: 1,
    generation: randomUUID(),
    status,
    expiresAt: now + maxAge * 1000,
  });
  return [
    /* Same shadowing hazard as the cart: a browser from before these moved to
       the parent domain holds a host-only copy of each name, and that copy is
       sent first and read first. Expire it beside the replacement. */
    ...legacyHostScopeClearHeaders(
      [SESSION_COOKIE, IDENTITY_COOKIE],
      isSecure(),
      host,
    ),
    `${IDENTITY_COOKIE}=${hint}; ${displayAttributes(persistent ? maxAge : null, host)}`,
    ...nameCookieHeaders(name, !name ? 0 : persistent ? maxAge : null, host),
  ];
}

/* The customer's name stays on the host that wrote it, never on the shared
   parent domain: the agency's partner server receives every
   .peptidescollective.com cookie (their Oct 12 review). A copy an older
   release wrote there is expired beside it; the header fills the other
   language's host from the identity hint. */
function nameCookieHeaders(name: string, maxAge: number | null, host?: string | null) {
  const domain = cookieDomainFor(host);
  const secure = isSecure() ? "; Secure" : "";
  return [
    ...(domain ? [`${NAME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Domain=${domain}${secure}`] : []),
    `${NAME_COOKIE}=${encodeURIComponent(name)}; Path=/${maxAge === null ? "" : `; Max-Age=${maxAge}`}; SameSite=Lax${secure}`,
  ];
}

/** A fresh guest generation, so a restored page drops the old account's UI. */
export function clearedDisplayCookieHeaders({ now = Date.now(), host }: CookieOptions = {}) {
  return displayCookieHeaders(
    "guest",
    Math.floor(now / 1000) + MAX_LIFETIME_SECONDS,
    "",
    { now, host },
  );
}

/** The auth credential carried by a request, or null. */
export function readSessionFromHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    if (trimmed.slice(0, separator) !== SESSION_COOKIE) continue;
    return decodeSessionValue(trimmed.slice(separator + 1));
  }
  return null;
}
