/* Whether the catalogue anyone is looking at came from WooCommerce.
 *
 * The storefront falls back to the offline snapshot when a live read fails, and
 * that is the right behaviour while serving traffic: a browse page must not 500
 * because the store had a bad minute. During a production build it is the wrong
 * silence, because the fallback gets baked into prerendered pages and the build
 * still exits 0, so nothing downstream can tell a healthy release from a
 * degraded one.
 *
 * Kept free of server-only imports so the decision logic is directly testable. */

/** Greppable, unique, and deliberately shouty. CI can key on this exact string. */
export const CATALOG_DEGRADED_MARKER = "CATALOG_BUILD_DEGRADED";

export type CatalogHealth = {
  /** How many live reads fell back to the snapshot in this process. */
  degradedReads: number;
  /** The first failure's description; later ones are almost always the same. */
  firstReason: string;
  /** Whether the marker has already been printed for this process. */
  announced: boolean;
};

export const freshCatalogHealth = (): CatalogHealth => ({
  degradedReads: 0,
  firstReason: "",
  announced: false,
});

/**
 * Record one degraded read and decide what, if anything, to print.
 *
 * The marker is emitted once per process. A build that renders thirty pages
 * against an unreachable store produces one line per worker rather than thirty
 * error blocks; the running count stays on the health record, where a
 * long-lived process reports it at exit and a build simply does not need it.
 * Returning null rather than logging keeps this function pure and testable.
 */
export function noteDegradedRead(
  health: CatalogHealth,
  reason: string,
  { buildPhase, worker }: { buildPhase: boolean; worker?: string | number },
): string | null {
  health.degradedReads += 1;
  if (!health.firstReason) health.firstReason = reason;
  if (health.announced) return null;
  health.announced = true;

  /* Once per process, not once per build: `next build` prerenders across
     several worker processes and each has its own module state, so the marker
     can legitimately appear a few times. The worker id is included so those
     lines read as separate workers rather than as the same one repeating. A
     count is deliberately not promised - Next does not exit its workers
     cleanly, so an exit hook never runs to deliver one. */
  return buildPhase
    ? `${CATALOG_DEGRADED_MARKER}: live WooCommerce catalog read failed during the` +
      ` production build; prerendered pages are using the offline snapshot.` +
      ` First failure: ${reason}.` +
      (worker === undefined ? "" : ` (build worker ${worker};`) +
      `${worker === undefined ? " Further" : " further"} occurrences in this` +
      ` worker are suppressed.${worker === undefined ? "" : ")"}`
    : `[catalog] live read failed; serving snapshot. ${reason}.` +
      ` Further occurrences are suppressed for this process.`;
}

/** Where the catalogue on a page came from. `snapshot` is the flag being off on
    purpose; `fallback` is a live read that failed and was papered over. */
export type CatalogSource = "live" | "snapshot" | "fallback";

/**
 * Whether a degraded read should fail the build outright.
 *
 * The marker alone was not enough: a green deploy and a page that renders read
 * as "connected", and nobody opens the build log to find the one line saying
 * otherwise. So a production build refuses to bake the fallback into pages. The
 * escape hatch exists for the day the store is down and a release cannot wait.
 */
export function shouldFailBuild({
  buildPhase,
  allowSnapshotBuild,
}: {
  buildPhase: boolean;
  allowSnapshotBuild: boolean;
}) {
  return buildPhase && !allowSnapshotBuild;
}

/** The end-of-process tally, or null when nothing degraded. */
export function degradedSummary(
  health: CatalogHealth,
  { buildPhase }: { buildPhase: boolean },
): string | null {
  if (health.degradedReads === 0) return null;
  const reads = `${health.degradedReads} degraded catalog read${health.degradedReads === 1 ? "" : "s"}`;
  return buildPhase
    ? `${CATALOG_DEGRADED_MARKER}: ${reads} in this build. First failure: ${health.firstReason}.`
    : `[catalog] ${reads} in this process. First failure: ${health.firstReason}.`;
}

/** A failure, described tightly enough to act on and without upstream detail. */
export function describeCatalogFailure(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? ` status=${candidate.status}` : "";
    const name = typeof candidate.name === "string" ? candidate.name : "Error";
    // Trimmed so the caller can end its own sentence without doubling the stop.
    const message =
      typeof candidate.message === "string" ? candidate.message.replace(/\.+$/, "") : "";
    return `${name}${status}${message ? `: ${message}` : ""}`;
  }
  return "unknown catalog failure";
}
