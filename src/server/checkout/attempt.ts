import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* One payment attempt, carried by the browser between the checkout's steps.
 *
 * A card payment takes several round trips - save the card, the bank's 3DS
 * check, the charge, then polling - and the browser holds the thread between
 * them. What it holds is sealed here: the amount and the saved card cannot be
 * swapped for others, and an attempt only works for the account that began
 * it. Nothing secret is inside, so it is signed rather than encrypted.
 *
 * Pure (no `server-only`, no env) so the seal can be tested directly. */

export type PaymentAttempt = {
  /** Random id: the one charge this attempt may make is keyed on it. */
  nonce: string;
  instrumentId: string;
  /** Minor units, read from WooCommerce when the attempt began. */
  amount: number;
  currency: string;
  /** Digest of the session that began it, never the session itself. */
  owner: string;
  threedsSessionId?: string;
  paymentId?: string;
  /** The WooCommerce order this pays. Absent only for sandbox test payments. */
  order?: { id: number; key: string; number: string };
  /** Sandbox test mode only: decline this attempt as a processor would (see simulatedDecline). */
  simulate?: "insufficient_funds";
  /** Epoch milliseconds. */
  expires: number;
};

const TTL_MS = 30 * 60_000;

export const ownerDigest = (auth: string) => createHash("sha256").update(auth).digest("hex").slice(0, 32);

const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(`checkout-attempt:${body}`).digest("base64url");

export function newAttempt(
  input: Pick<PaymentAttempt, "instrumentId" | "amount" | "currency" | "order" | "simulate">,
  auth: string,
  now = Date.now(),
): PaymentAttempt {
  return {
    ...input,
    nonce: randomBytes(16).toString("hex"),
    owner: ownerDigest(auth),
    expires: now + TTL_MS,
  };
}

export function sealAttempt(attempt: PaymentAttempt, secret: string): string {
  const body = Buffer.from(JSON.stringify(attempt)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The attempt, or null when it was altered, expired or begun by someone else. */
export function openAttempt(
  token: string,
  { secret, auth, now = Date.now() }: { secret: string; auth: string; now?: number },
): PaymentAttempt | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let attempt: PaymentAttempt;
  try {
    attempt = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PaymentAttempt;
  } catch {
    return null;
  }
  if (attempt.expires < now || attempt.owner !== ownerDigest(auth)) return null;
  return attempt;
}
