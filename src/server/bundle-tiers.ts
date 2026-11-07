import "server-only";

import { cache } from "react";
import { z } from "zod";
import { env } from "@/env";
import { cachedPublic, publicCacheTags } from "@/server/cache";
import { joinUrl, readTimeoutMs, storeApiHeaders, WordPressRequestError } from "@/server/wordpress/client";
import { limitedRead } from "@/server/wordpress/read-limit";
import { defaultBundleTiers, type BundleTier } from "@/lib/bundle-tiers";

/* The Bundle & Save tiers, read from the site that charges them.
 *
 * Cached under the catalogue's tag rather than one of its own, because the
 * plugin announces a tier change through the product webhook and that expires
 * `public:catalog`. One tag, one webhook, no second notification path for one
 * setting.
 *
 * Only an answer WordPress actually gave is cached. A failed read throws out
 * of the loader, so the data cache keeps serving the last answer it had and
 * retries on the next request. It used to return the built-in tiers instead,
 * and the data cache stored that guess for an hour as if WordPress had said
 * it: a staging site too slow to answer a build switched Bundle & Save back
 * on, 4% and 7% badges included, after the owner had turned it off.
 *
 * With no cached answer at all, the offer is left off the page. Hiding a
 * discount WooCommerce will still apply costs an upsell; showing one it will
 * not apply quotes a price the basket then contradicts. Switched off is
 * honoured the same way: `enabled: false` publishes no tiers. */

const TIERS_PATH = "/wp-json/tpc/v1/bundle-tiers";
const TIERS_TTL_SECONDS = 3600;

const payload = z.object({
  enabled: z.boolean(),
  tiers: z
    .array(
      z.object({
        min: z.number().int().min(1),
        percent: z.number().min(0).max(99.9),
        label: z.string().default(""),
        badge: z.string().default(""),
      }),
    )
    .default([]),
});

type TierState = {
  lastGood: BundleTier[] | null;
  /** The read currently in flight, shared by everyone who asks meanwhile. */
  inFlight?: Promise<BundleTier[]> | null;
};

const globalState = globalThis as typeof globalThis & {
  __tpcBundleTierState?: TierState;
};
const state: TierState = (globalState.__tpcBundleTierState ??= { lastGood: null });

async function readTiers(baseUrl: string): Promise<BundleTier[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readTimeoutMs());
  try {
    const response = await fetch(joinUrl(baseUrl, TIERS_PATH), {
      // With the agency's gate on, WordPress answers this route to the bridge key only.
      headers: { accept: "application/json", ...storeApiHeaders() },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new WordPressRequestError("WordPress refused the bundle tier read.", response.status);
    }
    const parsed = payload.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new WordPressRequestError("The bundle tier feed returned an unreadable response.", response.status);
    }
    if (!parsed.data.enabled) return [];
    return parsed.data.tiers
      .map((tier) => ({
        ...tier,
        label: tier.label || `${tier.min} Packs`,
      }))
      .sort((a, b) => a.min - b.min);
  } catch (error) {
    if (error instanceof WordPressRequestError) throw error;
    throw new WordPressRequestError(
      error instanceof Error && error.name === "AbortError"
        ? "The bundle tier feed timed out."
        : "The bundle tier feed could not be reached.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** The tiers every page prices from. */
export const getBundleTiers = cache(async (): Promise<BundleTier[]> => {
  const baseUrl = env.WOOCOMMERCE_URL;
  /* No WordPress to ask is a deployment choice, not a failed read: the
     offline storefront prices from the shop's own defaults. */
  if (env.WOOCOMMERCE_CATALOG_ENABLED !== "true" || !baseUrl) return defaultBundleTiers;
  /* `cache` dedupes within one render; `inFlight` across concurrent requests,
     as the catalogue and lab reports do: on an empty cache, a crowd of
     visitors (or a cold prerender) makes one read, not one each. */
  const read = (state.inFlight ??= cachedPublic({
    /* v2: v1 entries may hold the defaults a failed read used to cache. */
    key: ["bundle-tiers", "wordpress", "tpc", "v2", baseUrl],
    tags: [publicCacheTags.catalog],
    revalidate: TIERS_TTL_SECONDS,
    loader: () => limitedRead(() => readTiers(baseUrl)),
  }));
  try {
    const tiers = await read;
    state.lastGood = tiers;
    return tiers;
  } catch (error) {
    console.error(
      `[bundle-tiers] read failed (${error instanceof Error ? error.message : "unknown"}); serving ${
        state.lastGood ? "the last good tiers" : "no bundle offer"
      }.`,
    );
    return state.lastGood ?? [];
  } finally {
    if (state.inFlight === read) state.inFlight = null;
  }
});
