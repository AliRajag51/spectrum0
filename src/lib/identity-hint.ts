/* Readable display state about the session. Never a credential.
 *
 * Two cookies, both editable by the browser and both worthless to an attacker:
 * `pc_name` is the one word the header prints, and `pc_identity` is a versioned
 * envelope whose generation changes on every authentication event. No server
 * authorizes anything from either — the session cookie is HttpOnly and
 * WordPress revalidates it on every account call.
 *
 * They exist so the header can name a customer without a request per page, and
 * so the cart can tell that the account using this browser has changed. */

import { storefrontCookieDomain } from "./storefront-cookie-domain.ts";

export const NAME_COOKIE = "ssb_name";
export const IDENTITY_COOKIE = "ssb_identity";

/* Dispatched after any authentication event so surfaces that hold state for a
   customer - the cart, the header - reconcile without waiting for a reload. */
export const IDENTITY_EVENT = "pc:identity-changed";

/** One readable cookie, from the browser. Returns "" when there is none. */
export function readBrowserCookie(name: string) {
  if (typeof document === "undefined") return "";
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1 || trimmed.slice(0, separator) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Stop presenting a customer this browser is not signed in as.
 *
 * These two are display state the browser owns - no server authorizes anything
 * from either - so the browser is allowed to correct them, and is the only side
 * that can when the session they described has already lapsed upstream. Answers
 * whether anything was actually being presented, so a caller only announces a
 * change that happened.
 */
export function clearBrowserIdentity() {
  if (typeof document === "undefined") return false;
  const held = Boolean(
    readBrowserCookie(NAME_COOKIE) || readBrowserCookie(IDENTITY_COOKIE),
  );
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const name of [NAME_COOKIE, IDENTITY_COOKIE]) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    const domain = storefrontCookieDomain(window.location.origin);
    if (domain) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Domain=${domain}${secure}`;
  }
  return held;
}

export type IdentityStatus = "member" | "guest";
export type IdentityHint = {
  version: 1;
  generation: string;
  status: IdentityStatus;
  expiresAt: number;
};

export function serializeIdentityHint(hint: IdentityHint) {
  return encodeURIComponent(JSON.stringify(hint));
}

export function parseIdentityHint(
  value: string | null | undefined,
  now = Date.now(),
): IdentityHint | null {
  if (typeof value !== "string" || !value || value.length > 1024) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    try {
      raw = JSON.parse(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const hint = raw as Record<string, unknown>;
  if (
    hint.version !== 1 ||
    typeof hint.generation !== "string" ||
    !/^[A-Za-z0-9-]{1,80}$/.test(hint.generation) ||
    (hint.status !== "member" && hint.status !== "guest") ||
    typeof hint.expiresAt !== "number" ||
    !Number.isFinite(hint.expiresAt) ||
    hint.expiresAt <= now
  ) {
    return null;
  }
  return {
    version: 1,
    generation: hint.generation,
    status: hint.status,
    expiresAt: hint.expiresAt,
  };
}

/**
 * Whether a basket held by this browser belongs to whoever is using it now.
 *
 * A guest who signs in keeps their basket: that is the whole point of the
 * bridge minting a session without touching the cart. What must not survive is
 * a *member* session ending or being replaced, because on a shared machine the
 * next person would inherit the previous customer's selection.
 */
export function cartSurvivesIdentityChange(
  previous: { generation: string; status: IdentityStatus } | null,
  next: IdentityHint | null,
) {
  if (!previous) return true;
  if (next && next.generation === previous.generation) return true;
  return previous.status !== "member";
}

/** The one word the chrome prints for a signed-in customer. */
export function givenName(user: {
  firstName?: string;
  displayName?: string;
  email?: string;
}) {
  const first = (user.firstName ?? "").trim();
  if (first) return first;
  const display = (user.displayName ?? "").trim();
  if (display) return display.split(/\s+/)[0]!;
  const email = (user.email ?? "").trim();
  if (email) return email.split("@")[0]!;
  return "";
}
