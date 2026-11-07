import { z } from "zod";
import { isMemberJar, jarIdentity, memberJar, type CartJar } from "./cart-jar.ts";

/* Moving a guest basket onto the member who just signed in (cart-adopt, the
 * agency's Oct 19 notes).
 *
 * WordPress keys a cart by its session cookie, else the signed-in user, else
 * the guest id, so a sign-in made server to server leaves the basket under
 * the guest key. `POST /wp-json/nvm/v1/tpc/cart-adopt` moves it to the member
 * (merging when both hold items) under the store's own cart lock. From then on
 * every cart and checkout call goes as the member: the member header and no
 * guest cookie, never a mix of the two.
 *
 * It runs on the first cart call of a signed-in shopper whose jar is still a
 * guest's, which follows every way of signing in (the forms, Google,
 * Facebook, WordPress's own sign-in links) without each needing its own hook.
 * A repeat is harmless: WordPress answers "nothing" or "already_member".
 *
 * Pure, with the bridge call and the clock passed in, so every answer the
 * notes list is tested without a store. */

export const adoptAnswer = z.union([
  z.object({ ok: z.literal(true), result: z.string().max(40) }),
  z.object({
    ok: z.literal(false),
    reason: z.string().max(60),
    retry_after: z.number().nonnegative().max(60).optional(),
  }),
]);

export type AdoptAnswer = z.infer<typeof adoptAnswer>;

export type AdoptIdentity = { cid: string; wcs: string | null };

/** Declined by WordPress (checkout in progress, staff, ...): asked again after this. */
export const ADOPT_DECLINED_RETRY_MS = 10 * 60_000;
/** Not answered (rate limit, switched off, unreachable): asked again after this. */
export const ADOPT_FAILED_RETRY_MS = 60_000;
/** The longest a "busy" answer is waited out within one request. */
const BUSY_WAIT_CAP_MS = 2_000;

/**
 * The jar a signed-in shopper's cart calls should use.
 *
 * A member jar is returned as it is. A guest jar is moved: on success the
 * member's jar (no guest cookies), otherwise the guest jar, kept as the notes
 * say, with the time it may be asked again. A guest with no basket at all has
 * nothing to move and goes straight to the member's own cart.
 */
export async function adoptGuestCart(
  jar: CartJar | null,
  deps: {
    adopt: (identity: AdoptIdentity) => Promise<AdoptAnswer>;
    sleep: (ms: number) => Promise<void>;
    now: number;
  },
): Promise<CartJar> {
  if (isMemberJar(jar)) return jar;
  const identity = jarIdentity(jar);
  if (!jar || !identity) return memberJar(jar?.count ?? 0);
  if (jar.adoptAfter && deps.now < jar.adoptAfter) return jar;

  let answer: AdoptAnswer;
  try {
    answer = await deps.adopt(identity);
    if (!answer.ok && answer.reason === "busy") {
      // The cart is locked by another request: wait it out once, as the notes say.
      await deps.sleep(Math.min((answer.retry_after ?? 2) * 1000, BUSY_WAIT_CAP_MS));
      answer = await deps.adopt(identity);
    }
  } catch {
    return { ...jar, adoptAfter: deps.now + ADOPT_FAILED_RETRY_MS };
  }

  if (answer.ok) return memberJar(jar.count);
  // Still busy: nothing was moved, and the next cart call simply asks again.
  if (answer.reason === "busy") return jar;
  return { ...jar, adoptAfter: deps.now + ADOPT_DECLINED_RETRY_MS };
}
