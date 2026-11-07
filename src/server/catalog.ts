import "server-only";

import { cache } from "react";
import { products as snapshotProducts } from "@/lib/catalog";
import {
  CATALOG_DEGRADED_MARKER,
  degradedSummary,
  describeCatalogFailure,
  freshCatalogHealth,
  noteDegradedRead,
  shouldFailBuild,
  type CatalogHealth,
  type CatalogSource,
} from "@/lib/catalog-health";
import type { Product } from "@/lib/types";
import { toStorefrontProduct } from "@/lib/storefront";
import { createCatalogRepository, WooCatalogRepository } from "@/server/wordpress/catalog";

type CatalogRead = { products: Product[]; source: CatalogSource };

/* The public catalog read used by every rendering surface.

   Live WooCommerce is the source of truth whenever the flag is on, but a
   browse page must not 500 because the store is unreachable, so a failed live
   read degrades to the last known-good snapshot. The cart deliberately does NOT
   share this fallback: it is a WooCommerce cart, priced by WooCommerce, so an
   outage there fails loudly rather than quoting a customer a stale price.

   Two things guard that fallback. It is announced - once - so a production
   build cannot look healthy while baking snapshot data into prerendered pages.
   And concurrent callers share one upstream read, because they did not: a cold
   build had thirty-odd pages each firing its own full catalog fetch, and
   WooCommerce answered the pile-up with HTTP 500. */

type CatalogState = {
  health: CatalogHealth;
  /** The read currently in flight, shared by everyone who asks meanwhile. */
  inFlight: Promise<CatalogRead> | null;
  summaryHooked: boolean;
  /** The last catalogue WooCommerce returned in this process, kept for a failed read. */
  lastLive?: Product[] | null;
};

const globalState = globalThis as typeof globalThis & {
  __tpcCatalogState?: CatalogState;
};
const state: CatalogState = (globalState.__tpcCatalogState ??= {
  health: freshCatalogHealth(),
  inFlight: null,
  summaryHooked: false,
});

/* Next sets this for the duration of `next build`, which is exactly the window
   where a silent fallback is unacceptable. */
const inBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

/* A tally when the process ends. Worth having for a long-lived server, where
   the count is the interesting number; it does not fire during `next build`,
   which does not exit its workers cleanly, so the build message promises no
   count and the marker itself carries the signal. */
function hookSummary() {
  if (state.summaryHooked) return;
  state.summaryHooked = true;
  process.on("exit", () => {
    const summary = degradedSummary(state.health, { buildPhase: inBuildPhase() });
    if (summary) console.error(summary);
  });
}

function announce(error: unknown) {
  hookSummary();
  const line = noteDegradedRead(state.health, describeCatalogFailure(error), {
    buildPhase: inBuildPhase(),
    worker: inBuildPhase() ? process.pid : undefined,
  });
  if (line) console.error(line);
}

/**
 * The catalog and where it came from. During `next build` a failed live read
 * throws instead of falling back, so a broken store connection fails the deploy.
 *
 * `cache` dedupes within a single render; `inFlight` dedupes across concurrent
 * renders in this process, which is what a cold prerender needs. The promise is
 * released as soon as it settles, so a failure is never cached - the next
 * caller retries rather than inheriting a bad answer.
 */
export const getCatalogWithSource = cache(async (): Promise<CatalogRead> => {
  if (state.inFlight) return state.inFlight;

  const degrade = (error: unknown): CatalogRead => {
    announce(error);
    /* The last good live copy beats the offline snapshot: its products, ids
       and prices are WooCommerce's, an hour old at most (the agency, Oct 26).
       Not during a build, which must read the store or fail. */
    if (!inBuildPhase() && state.lastLive?.length) return { products: state.lastLive, source: "live" };
    if (
      shouldFailBuild({
        buildPhase: inBuildPhase(),
        allowSnapshotBuild: process.env.CATALOG_ALLOW_SNAPSHOT_BUILD === "true",
      })
    ) {
      throw new Error(
        `${CATALOG_DEGRADED_MARKER}: refusing to build with the offline snapshot. ` +
          `The live WooCommerce read failed (${describeCatalogFailure(error)}). ` +
          `Fix the connection to WOOCOMMERCE_URL, or set ` +
          `CATALOG_ALLOW_SNAPSHOT_BUILD=true to ship the snapshot on purpose.`,
      );
    }
    return { products: snapshotProducts, source: "fallback" };
  };

  const read = (async (): Promise<CatalogRead> => {
    let repository;
    try {
      repository = createCatalogRepository();
    } catch (error) {
      return degrade(error);
    }
    if (!(repository instanceof WooCatalogRepository)) {
      return { products: await repository.listProducts(), source: "snapshot" };
    }
    let live: Product[];
    try {
      live = await repository.listProducts();
    } catch (error) {
      /* A build waits for one more try before it fails the deploy: the first
         read of a cold build meets every other worker's first read (Oct 26). */
      if (!inBuildPhase()) return degrade(error);
      try {
        live = await repository.listProducts();
      } catch (again) {
        return degrade(again);
      }
    }
    if (live.length) {
      state.lastLive = live;
      return { products: live, source: "live" };
    }
    /* An empty live catalog is a degraded read too, and the quieter of the
       two: it fails no request and would otherwise serve the snapshot with
       nothing said at all. */
    return degrade(new Error("live catalog returned no products"));
  })();

  state.inFlight = read;
  try {
    return await read;
  } finally {
    if (state.inFlight === read) state.inFlight = null;
  }
});

/** The catalog, live when it can be and the snapshot when it cannot. */
export const getCatalog = cache(async (): Promise<Product[]> => (await getCatalogWithSource()).products);

/** Where this render's catalog came from; surfaced as a meta tag on every page. */
export const getCatalogSource = cache(async (): Promise<CatalogSource> => (await getCatalogWithSource()).source);

export async function getProduct(id: string) {
  return (await getCatalog()).find((product) => product.id === id);
}

/** Read-only view of this process's catalog health, for tests and diagnostics. */
export const catalogHealth = () => ({ ...state.health });

/** The catalogue in the shape Spectrum's components render. */
export const getStorefrontProducts = cache(async () =>
  (await getCatalog()).map(toStorefrontProduct),
);

export async function getStorefrontProduct(slug: string) {
  return (await getStorefrontProducts()).find((product) => product.slug === slug);
}
