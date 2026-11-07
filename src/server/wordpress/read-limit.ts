/* At most a few public WordPress reads at once from this server process.
 *
 * A rebuild renders dozens of pages together, and each asked WordPress for the
 * catalogue, lab reports, bundle tiers and tracking settings itself: 40 to 50
 * requests at once against a site with 24 PHP workers, which then timed out
 * at 5 s and turned into product 404s (the agency, Oct 26). The rest wait
 * here instead of in WordPress's queue. The timeout of each read starts when
 * it is let through, so waiting here never counts against it.
 *
 * Public reads only. A shopper's cart, account and checkout calls are not
 * queued behind a rebuild. The limit is per process: several build workers or
 * serverless instances each keep their own, which the caches in front of
 * every caller keep small. */

export const WORDPRESS_READ_CONCURRENCY = 6;
/* `next build` runs several workers, each with its own limit, so each gets
   fewer: about four workers times two keeps a whole build near eight. */
export const BUILD_READ_CONCURRENCY = 2;

const slots = () =>
  process.env.NEXT_PHASE === "phase-production-build" ? BUILD_READ_CONCURRENCY : WORDPRESS_READ_CONCURRENCY;

type Limiter = { active: number; waiting: Array<() => void> };

const globalState = globalThis as typeof globalThis & { __tpcWordPressReadLimit?: Limiter };
const limiter: Limiter = (globalState.__tpcWordPressReadLimit ??= { active: 0, waiting: [] });

/** Run a public WordPress read once a slot is free. */
export async function limitedRead<T>(read: () => Promise<T>, state: Limiter = limiter): Promise<T> {
  if (state.active < slots()) {
    state.active += 1;
  } else {
    // The finishing read hands its slot straight over, so no newcomer slips in between.
    await new Promise<void>((resolve) => state.waiting.push(resolve));
  }
  try {
    return await read();
  } finally {
    const next = state.waiting.shift();
    if (next) next();
    else state.active -= 1;
  }
}

/** A separate limiter, for tests. */
export const newReadLimiter = (): Limiter => ({ active: 0, waiting: [] });
