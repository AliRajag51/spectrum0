import "server-only";

import { cache } from "react";
import { env } from "@/env";
import { cachedPublic, publicCacheTags } from "@/server/cache";
import { getCatalog } from "@/server/catalog";
import { joinUrl, readTimeoutMs, storeApiHeaders, WordPressRequestError } from "@/server/wordpress/client";
import { limitedRead } from "@/server/wordpress/read-limit";
import {
  mapLabReports,
  readLabReportsPayload,
  readOrLastGood,
  type LabReport,
  type LabReportLibrary,
} from "@/server/wordpress/lab-report-mapping";

/* The analytical record behind every batch number the site prints.
 *
 * One read of `tpc/v1/lab-reports`, with the bridge key (docs/integration-contract.md
 * section 9), held in Next's data cache for an hour under `public:reports`
 * and refreshed early by the signed `tpc.report` webhook, so browsing causes
 * no WordPress request. Products come from the catalogue, which is where a
 * report's key turns into a name and a category.
 *
 * A failed read serves the last good answer rather than an empty library: a
 * certificate page that silently loses its certificates is worse than one
 * showing an hour-old set. With no last good answer - a cold process whose
 * first read fails - the pages render the empty state they already have. */

const REPORTS_PATH = "/wp-json/tpc/v1/lab-reports";
const REPORTS_TTL_SECONDS = 3600;

type ReportState = {
  /** The last successfully read feed, kept for the degraded path. */
  lastGood: LabReport[] | null;
  /** The read currently in flight, shared by everyone who asks meanwhile. */
  inFlight: Promise<LabReport[]> | null;
  failures: number;
  lastFailure: string | null;
};

const globalState = globalThis as typeof globalThis & {
  __tpcLabReportState?: ReportState;
};
const state: ReportState = (globalState.__tpcLabReportState ??= {
  lastGood: null,
  inFlight: null,
  failures: 0,
  lastFailure: null,
});

/**
 * One uncached read of the feed. Exported for the health route, which must
 * not be able to report a cache hit as a reachable WordPress.
 */
export async function readLabReportFeed(): Promise<LabReport[]> {
  const baseUrl = env.WOOCOMMERCE_URL;
  if (!baseUrl) {
    throw new WordPressRequestError(
      "WOOCOMMERCE_URL is not set, so lab reports cannot be read.",
      503,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readTimeoutMs());
  try {
    const response = await fetch(joinUrl(baseUrl, REPORTS_PATH), {
      // With the agency's gate on, WordPress answers this route to the bridge key only.
      headers: { accept: "application/json", ...storeApiHeaders() },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new WordPressRequestError(
        "WordPress refused the lab report read.",
        response.status,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WordPressRequestError(
        "The lab report feed returned an invalid JSON response.",
        response.status,
      );
    }
    return readLabReportsPayload(body);
  } catch (error) {
    if (error instanceof WordPressRequestError) throw error;
    throw new WordPressRequestError(
      error instanceof Error && error.name === "AbortError"
        ? "The lab report feed timed out."
        : error instanceof Error
          ? error.message
          : "The lab report feed could not be reached.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

function announce(error: unknown) {
  state.failures += 1;
  state.lastFailure =
    error instanceof Error ? error.message : "unknown lab report failure";
  console.error(
    `[lab-reports] read failed (${state.lastFailure}); serving ${
      state.lastGood ? "the last good feed" : "an empty library"
    }.`,
  );
}

/* `cache` dedupes within one render; `inFlight` dedupes across the concurrent
   renders of a cold prerender, which is what sent thirty-odd simultaneous
   reads at WooCommerce the last time it was left out. */
const readReports = cache(async (): Promise<LabReport[]> => {
  /* No WordPress configured is a deployment choice, not a failed read: the
     offline storefront has no certificates to publish and says so quietly. */
  if (!env.WOOCOMMERCE_URL) return state.lastGood ?? [];
  if (state.inFlight) return state.inFlight;

  const read = readOrLastGood(
    state,
    () =>
      cachedPublic({
        key: ["lab-reports", "wordpress", "tpc", "v1"],
        tags: [publicCacheTags.reports],
        revalidate: REPORTS_TTL_SECONDS,
        loader: () => limitedRead(() => readLabReportFeed()),
      }),
    announce,
  );

  state.inFlight = read;
  try {
    return await read;
  } finally {
    if (state.inFlight === read) state.inFlight = null;
  }
});

/** The published batch records, in the shapes the pages already render. */
export const getLabReports = cache(async (): Promise<LabReportLibrary> => {
  const [reports, products] = await Promise.all([readReports(), getCatalog()]);
  return mapLabReports(reports, products);
});

/** Read-only view of this process's lab report health, for diagnostics. */
export const labReportHealth = () => ({
  failures: state.failures,
  lastFailure: state.lastFailure,
  cached: state.lastGood?.length ?? null,
});
