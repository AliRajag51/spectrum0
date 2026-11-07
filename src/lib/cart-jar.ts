import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

/* The WordPress cookie jar, one per shopper.
 *
 * On this site the Store API `Cart-Token` does not identify a cart. Identity is
 * the signed `tpc_cid` cookie the site issues, plus whatever WooCommerce session
 * cookie rides along with it. The browser never sees either: this server holds
 * them on the shopper's behalf, replays them on every Store API call, and keeps
 * the lot in one encrypted HttpOnly cookie, `pc_wp`.
 *
 * The jar is a JSON object under AES-256-GCM. GCM authenticates as well as
 * encrypts, so a value that was edited, truncated or signed by another key fails
 * to open and reads as "no jar" rather than as a different shopper's identity. */

export const CART_JAR_COOKIE = "ssb_wp";
export const CART_ID_COOKIE = "tpc_cid";
export const WC_SESSION_PREFIX = "wp_woocommerce_session_";

// The `tpc_cid` lifetime. WordPress refreshes it on every write it accepts.
export const CART_JAR_TTL_SECONDS = 60 * 60 * 24 * 30;

const jarSchema = z.object({
  v: z.literal(1),
  cid: z.string().min(1).max(2048).optional(),
  wcs: z.string().min(1).max(4096).optional(),
  token: z.string().min(1).max(4096).optional(),
  count: z.number().int().nonnegative(),
  /* The basket now lives on the member's WordPress account (cart-adopt, the
     agency's Oct 19 notes): Store API calls go as the member, never with the
     guest cookies, which a member jar no longer holds. */
  member: z.literal(true).optional(),
  /* A cart move WordPress declined (checkout in progress, staff, ...): the
     guest jar is kept and the move is not asked for again before this time. */
  adoptAfter: z.number().int().nonnegative().optional(),
});

export type CartJar = z.infer<typeof jarSchema> & {
  /** The member's credential, for this request only. Never sealed into the cookie. */
  auth?: string;
};

export const emptyJar = (): CartJar => ({ v: 1, count: 0 });

/** Whether this jar's basket is the signed-in member's own (after cart-adopt). */
export const isMemberJar = (jar: CartJar | null | undefined): jar is CartJar & { member: true } =>
  jar?.member === true;

/** A member's jar: no guest cookies, the basket is found by the member header. */
export const memberJar = (count = 0): CartJar => ({ v: 1, member: true, count });

/** Whether this jar names a shopper WordPress would recognise. */
export const hasIdentity = (jar: CartJar | null | undefined): jar is CartJar & { cid: string } =>
  Boolean(jar?.cid);

const KEY_INFO = "pc-wp-jar-v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/* Derived rather than used raw so the bridge key, when it is the fallback,
   never becomes an AES key directly; HKDF's `info` binds the derived key to
   this one purpose. */
function jarKey(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "", KEY_INFO, 32));
}

/** The jar as the cookie value: base64url of IV, auth tag and ciphertext. */
export function encodeJar(jar: CartJar, secret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", jarKey(secret), iv);
  cipher.setAAD(Buffer.from(KEY_INFO));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(jarSchema.parse(jar)), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** The jar behind a cookie value, or null for anything this key did not seal. */
export function decodeJar(value: string | null | undefined, secret: string): CartJar | null {
  if (!value || value.length > 16_384) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(value, "base64url");
  } catch {
    return null;
  }
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", jarKey(secret), raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(KEY_INFO));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = jarSchema.safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The `Cookie` request header this jar replays, or null when it holds none. */
export function jarCookieHeader(jar: CartJar | null | undefined) {
  // Never mix the two (the agency's notes): a member's calls carry no guest cookie.
  if (isMemberJar(jar)) return null;
  const pairs = [jar?.cid, jar?.wcs].filter((pair): pair is string => Boolean(pair));
  return pairs.length ? pairs.join("; ") : null;
}

/* A `Set-Cookie` line, reduced to the one pair the jar keeps and whether the
   site was deleting it. Attributes are dropped: the jar replays the pair as a
   request cookie, where attributes have no place. */
function parseSetCookie(line: string) {
  const [pair = "", ...attributes] = line.split(";");
  const separator = pair.indexOf("=");
  if (separator < 1) return null;
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  let deleted = value === "";
  for (const attribute of attributes) {
    const [key = "", raw = ""] = attribute.split("=");
    const attributeName = key.trim().toLowerCase();
    if (attributeName === "max-age" && Number(raw.trim()) <= 0) deleted = true;
    if (attributeName === "expires") {
      const at = Date.parse(raw.trim());
      if (Number.isFinite(at) && at <= Date.now()) deleted = true;
    }
  }
  return { name, pair: `${name}=${value}`, deleted };
}

/* `Headers.getSetCookie` is the only way to read several `Set-Cookie` lines
   without splitting on commas, which `Expires` dates also contain. Any runtime
   old enough to lack it hands back the joined form, which is read best-effort. */
function setCookieLines(headers: Headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const joined = headers.get("set-cookie");
  return joined ? [joined] : [];
}

/**
 * The jar after one Store API response.
 *
 * Whatever the site set is adopted: a fresh `tpc_cid` on bootstrap, a rotated
 * WooCommerce session cookie, a rotated `Cart-Token`. Anything it did not
 * mention is kept, because a response that says nothing about the session is
 * not a response that ended it.
 */
export function absorbResponse(jar: CartJar, headers: Headers): CartJar {
  /* A member's calls are identified by the member header alone. A session
     cookie or token WordPress sets on them is not kept, or the next call would
     carry a guest cookie after all. */
  if (isMemberJar(jar)) return { ...jar };
  let next: CartJar = { ...jar };
  for (const line of setCookieLines(headers)) {
    const cookie = parseSetCookie(line);
    if (!cookie) continue;
    if (cookie.name === CART_ID_COOKIE) {
      next = cookie.deleted ? { ...next, cid: undefined } : { ...next, cid: cookie.pair };
    } else if (cookie.name.startsWith(WC_SESSION_PREFIX)) {
      next = cookie.deleted ? { ...next, wcs: undefined } : { ...next, wcs: cookie.pair };
    }
  }
  const token = headers.get("cart-token");
  if (token) next = { ...next, token };
  return next;
}

/** The identity the checkout handoff carries, split as the bridge wants it. */
export function jarIdentity(jar: CartJar | null | undefined) {
  if (!hasIdentity(jar)) return null;
  const cid = jar.cid.slice(CART_ID_COOKIE.length + 1);
  const wcs = jar.wcs ?? null;
  return cid ? { cid, wcs } : null;
}

/**
 * A jar rebuilt from the identity the bridge reports on the way back.
 *
 * WordPress's cookies as the bridge read them off the returning browser, so
 * the next Store API call from here presents the session that just checked
 * out. After an order, that is the emptied one.
 */
export function jarFromIdentity(
  identity: { cid: string; wcs?: string | null },
  token?: string | null,
): CartJar {
  return {
    v: 1,
    cid: `${CART_ID_COOKIE}=${identity.cid}`,
    ...(identity.wcs ? { wcs: identity.wcs } : {}),
    ...(token ? { token } : {}),
    count: 0,
  };
}
