/* Minimal in-process sliding-window limiter.
 *
 * Guards the storefront's own auth surface: the bridge throttles per email
 * address, which it can only do after reading a body, and cannot tell one
 * caller's attempts from the whole shop's because every bridge call arrives
 * from this server. This keys on the caller instead, so the two cover
 * different halves of the same problem.
 *
 * Per Node process, which is right for a single instance. Behind more than one,
 * replace the Map with shared storage and keep this interface. */

type Bucket = number[];

const globalState = globalThis as typeof globalThis & {
  __tpcRateLimit?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> = (globalState.__tpcRateLimit ??= new Map());

const MAX_BUCKETS = 5000;

export type RateLimitVerdict = { ok: true } | { ok: false; retryAfter: number };

export function rateLimit(
  key: string,
  { max = 30, windowMs = 60_000, now = Date.now() } = {},
): RateLimitVerdict {
  const hits = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);

  if (hits.length >= max) {
    buckets.set(key, hits);
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0]!)) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic sweep, so a flood of unique keys cannot grow the map forever.
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, times] of buckets) {
      const last = times[times.length - 1];
      if (last === undefined || now - last > windowMs) buckets.delete(bucketKey);
    }
  }

  return { ok: true };
}

/** The caller, as well as a single-instance deployment can know them. */
export function clientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : headers.get("x-real-ip");
  return ip || "local";
}

export function resetRateLimitForTests() {
  buckets.clear();
}
