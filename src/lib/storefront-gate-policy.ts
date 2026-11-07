import { z } from "zod";

// Older Bridge versions omit the field and have no site gate setting.
const policy = z.object({ require_storefront_login: z.boolean().default(false) });
/* Headless Core 2.7.7: "Use the storefront's own checkout". An older core
   omits it, and that reads as off: the WordPress checkout (the agency, Oct 26). */
const checkoutPolicy = z.object({ storefront_checkout: z.boolean().default(false) });

/** One uncached read. Pages use cachedStorefrontGatePolicy, below. */
export async function readStorefrontGatePolicy(
  baseUrl: string,
  key: string,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
) {
  return policy.parse(await readBridgeHealth(baseUrl, key, timeoutMs, fetcher)).require_storefront_login;
}

/** Whether Headless Core sends the Checkout button to the storefront's own checkout. */
export async function readStorefrontCheckoutSetting(
  baseUrl: string,
  key: string,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
) {
  return checkoutPolicy.parse(await readBridgeHealth(baseUrl, key, timeoutMs, fetcher)).storefront_checkout;
}

/** The bridge's settings report, the protected `health` route. */
async function readBridgeHealth(
  baseUrl: string,
  key: string,
  timeoutMs: number,
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = new URL("wp-json/nvm/v1/health", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const internal = url.hostname === "localhost" || !url.hostname.includes(".");
  if (url.protocol !== "https:" && !internal) throw new Error("Insecure bridge endpoint");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nvm-bridge-key": key },
      body: "{}",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Bridge policy unavailable");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* The gate policy is asked for on every signed-out request when Global
   Config is not set up, so without a cache a busy day or a bot spike lands on
   WordPress one request at a time. Remembered for a minute per server, with
   simultaneous askers sharing one read; a saved WordPress setting therefore
   takes up to a minute to apply. When WordPress cannot answer, the last known
   answer stands and it is asked again at most every 10 seconds; with no answer
   yet, the error stands for those 10 seconds too (signed-out pages then 503,
   as before, rather than opening a gated shop). */
export const GATE_POLICY_TTL_MS = 60_000;
export const GATE_POLICY_RETRY_MS = 10_000;

export function createCachedGatePolicy(
  read: typeof readStorefrontGatePolicy = readStorefrontGatePolicy,
  now: () => number = Date.now,
): typeof readStorefrontGatePolicy {
  let known: { baseUrl: string; value: boolean; at: number } | null = null;
  let failure: { baseUrl: string; error: unknown; at: number } | null = null;
  let inFlight: { baseUrl: string; promise: Promise<boolean> } | null = null;

  return (baseUrl, key, timeoutMs) => {
    const t = now();
    const last = known?.baseUrl === baseUrl ? known : null;
    if (last && t - last.at < GATE_POLICY_TTL_MS) return Promise.resolve(last.value);
    if (failure?.baseUrl === baseUrl && t - failure.at < GATE_POLICY_RETRY_MS) {
      return last ? Promise.resolve(last.value) : Promise.reject(failure.error);
    }
    if (inFlight?.baseUrl === baseUrl) return inFlight.promise;

    const promise = read(baseUrl, key, timeoutMs).then(
      (value) => {
        known = { baseUrl, value, at: now() };
        failure = null;
        return value;
      },
      (error: unknown) => {
        failure = { baseUrl, error, at: now() };
        if (last) return last.value;
        throw error;
      },
    );
    const entry = { baseUrl, promise };
    inFlight = entry;
    const release = () => {
      if (inFlight === entry) inFlight = null;
    };
    promise.then(release, release);
    return promise;
  };
}

/** The gate policy as pages read it: cached, shared, and bounded on failure. */
export const cachedStorefrontGatePolicy = createCachedGatePolicy();

/** The checkout setting, with the same minute of caching and the same failure bounds. */
export const cachedStorefrontCheckoutSetting = createCachedGatePolicy(readStorefrontCheckoutSetting);
