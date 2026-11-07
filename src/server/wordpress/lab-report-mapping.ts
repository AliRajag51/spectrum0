import { z } from "zod";
import { labReportCards } from "../../lib/lab-report-cards.ts";
import type { LabReport as DirectoryReport } from "../../lib/lab-reports.ts";
import type { ArchivedReport, Batch, Category, Product } from "../../lib/types.ts";
import type { ProductReport } from "../../lib/types.ts";

/* Pure `tpc/v1/lab-reports` -> domain mapping. Deliberately free of
   `server-only`, `next/*` and path aliases so the contract can be exercised
   directly by the node test runner against a captured payload.

   The read is public and anonymous. It carries the analytical numbers the
   `lab-report` post type holds in ACF, which `extensions.tpc.certificates`
   does not: purity, measured weight, endotoxins, sterility, heavy metals and
   the previous batch. See docs/integration-contract.md section 9. */

export const labReportPrevious = z.object({
  label: z.string(),
  href: z.string(),
});

/* The analytical strings default to "" because that is what the contract
   publishes for a field nobody filled in; an omitted field reads the same as
   an explicit empty one. `contract` is a literal on purpose: a plugin
   publishing version 2 must fail this read rather than be half-understood. */
export const labReport = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  lot: z.string().default(""),
  date: z.string().default(""),
  purity: z.string().default(""),
  weight: z.string().default(""),
  endotoxins: z.string().default(""),
  sterility: z.string().default(""),
  heavy_metals: z.string().default(""),
  report: z.string(),
  previous: labReportPrevious.nullable().default(null),
  product_key: z.string().nullable().default(null),
  strength: z.string().default(""),
  link: z.enum(["exact", "derived", "unmatched"]),
});

export const labReportsPayload = z.object({
  contract: z.literal(1),
  generated: z.string(),
  reports: z.array(labReport),
});

export type LabReport = z.infer<typeof labReport>;
export type LabReportsPayload = z.infer<typeof labReportsPayload>;
export type LabReportLibrary = {
  batches: Batch[];
  archivedReports: ArchivedReport[];
  reports: DirectoryReport[];
};

export class LabReportContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabReportContractError";
  }
}

/* `"99.60% AVG"` -> `"99.60%"`. The digits stay exactly as the lab printed
   them, trailing zero and all, because the card quotes the certificate. */
export function purityText(value: string): string | null {
  const match = /\d+(?:\.\d+)?/.exec(value);
  return match ? `${match[0]}%` : null;
}

/** `"99.82%"` -> `99.82`. Anything without a number reads as unmeasured. */
export function purityNumber(value: string): number | null {
  const text = purityText(value);
  if (!text) return null;
  const parsed = Number(text.slice(0, -1));
  return Number.isFinite(parsed) ? parsed : null;
}

/* The plugin converts ACF's `d/m/Y` to ISO before publishing (section 9.3).
   Anything else is treated as unrecorded rather than guessed at: `03/04/2026`
   read as a date would be right once and wrong once. */
export function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/* Only tests that were actually run. An empty ACF field means "not recorded",
   never "Pass", so it produces no check at all. The labels are the ones the
   ledger and the product page already print. */
const checkFields = [
  ["endotoxins", "Endotoxins"],
  ["sterility", "Sterility"],
  ["heavy_metals", "Heavy metals"],
] as const;

export function reportChecks(report: LabReport): Record<string, string> | undefined {
  const checks: Record<string, string> = {};
  for (const [field, label] of checkFields) {
    const value = report[field].trim();
    if (value) checks[label] = value;
  }
  return Object.keys(checks).length ? checks : undefined;
}

/** `"Previous batch: TPC-1437"` -> `"TPC-1437"`. */
export function previousLot(label: string) {
  return label.replace(/^previous\s+batch\s*[:â€“â€”-]?\s*/i, "").trim();
}

const strengthKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/* Newest first: by ISO date, then by post id, which is the order section 9.1
   promises. An unrecorded date sorts last rather than first, so a report with
   no date never takes the current lot away from one that has a date. */
function newestFirst(a: LabReport, b: LabReport) {
  return b.date.localeCompare(a.date) || b.id - a.id;
}

type ResolvedReport = {
  report: LabReport;
  product: Product;
  status: Batch["status"];
};

/* A lot is per strength here - a 5 MG vial and a 40 MG vial of the same
   product are different production runs - so "the newest lot" is resolved
   per product and strength. Resolving it per product alone would mark four
   of GLP-3/R's five shipping lots historical and take them off the page. */
function resolve(reports: LabReport[], products: Product[]): ResolvedReport[] {
  const byKey = new Map(products.map((product) => [product.id, product]));
  const resolved: ResolvedReport[] = [];
  const seen = new Set<string>();
  for (const report of [...reports].sort(newestFirst)) {
    const product = report.product_key ? byKey.get(report.product_key) : undefined;
    /* `unmatched`, and anything naming a product this storefront does not
       sell, stays in the library and reaches no product page (section 9.2). */
    if (!product) continue;
    const key = `${product.id}::${strengthKey(report.strength)}`;
    const status = seen.has(key) ? "historical" : "current";
    seen.add(key);
    resolved.push({ report, product, status });
  }
  return resolved;
}

function toBatch({ report, product, status }: ResolvedReport): Batch | null {
  const purity = purityNumber(report.purity);
  const checks = reportChecks(report);
  /* A `Batch` is the record a page quotes a lot from. Without a lot there is
     nothing to quote, and the report still reaches the library through the
     published report directory. A missing purity costs the report its purity
     row and nothing else. */
  if (!report.lot) return null;
  return {
    lot: report.lot,
    product: product.name,
    strength: report.strength,
    ...(purity === null ? {} : { purity }),
    ...(report.purity.trim() ? { purityLabel: report.purity.trim() } : {}),
    date: isoDate(report.date),
    ...(report.weight ? { weight: report.weight } : {}),
    report: report.report,
    status,
    category: product.category,
    ...(checks ? { checks } : {}),
  };
}

function toArchived(
  { report, product }: ResolvedReport,
  purity: number | null,
): ArchivedReport {
  return {
    lot: report.lot,
    product: product.name,
    strength: report.strength,
    category: product.category,
    report: report.report,
    status: "historical",
    ...(purity === null ? {} : { purity }),
    ...(isoDate(report.date) ? { date: isoDate(report.date) } : {}),
    ...(report.weight ? { weight: report.weight } : {}),
  };
}

/* Lower case, one kind of dash, one kind of space - the rule the plugin
   matches titles by (`TPC_Lab_Reports::normalise`). `wptexturize` turns the
   hyphen an editor typed into an en dash and WordPress hands it back as
   `&#8211;`, so `GHK-Cu &#8211; 100MG` and `GHK-Cu - 100MG` have to compare
   equal or most of the library loses its artwork. */
const titleEntities: Record<string, string> = {
  "&#8211;": "â€“",
  "&#8212;": "â€”",
  "&ndash;": "â€“",
  "&mdash;": "â€”",
  "&amp;": "&",
  "&nbsp;": " ",
  "&#8217;": "â€™",
};

export function normaliseReportTitle(value: string) {
  return value
    .replace(
      /&(?:#8211|#8212|ndash|mdash|amp|nbsp|#8217);/g,
      (entity) => titleEntities[entity] ?? entity,
    )
    .toLowerCase()
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim();
}

/* `"2026-11-05"` -> `"5/11/2026"`. The card prints the day the way the lab
   wrote it in ACF, `d/m/Y` unpadded; the plugin only converts it to ISO on
   the way out (section 9.3). A date it could not read prints as nothing. */
function directoryDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : "";
}

/* The seven rows a card prints, in the order it prints them. A field the lab
   left empty produces no row at all - "not recorded" is not a result, and
   printing an empty row would claim it was. */
function directoryFields(report: LabReport) {
  return (
    [
      ["Date", directoryDate(report.date)],
      ["Lot", report.lot],
      ["Weight", report.weight],
      ["Purity", report.purity],
      ["Endotoxins", report.endotoxins],
      ["Sterility", report.sterility],
      ["Heavy metals", report.heavy_metals],
    ] as const
  )
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => ({ label, value }));
}

/* A test that has been sent to the lab but not reported back is published as
   the literal `Ordered`, so a report is pending when not one of its five
   measurements is an actual reading. An empty field says the same thing. */
const unreported = /^(ordered|pending|not reported)$/i;
const measurements = [
  "purity",
  "weight",
  "endotoxins",
  "sterility",
  "heavy_metals",
] as const;

export function reportPending(report: LabReport) {
  return !measurements.some((field) => {
    const value = report[field].trim();
    return value !== "" && !unreported.test(value);
  });
}

/* The library's own category keys, from the four the catalogue publishes. A
   report whose product this storefront does not carry keeps the empty string
   the directory has always used, which matches no tab. */
const directoryCategories: Record<string, string> = {
  "Research Peptides": "peptides",
  "Research Blends": "blends",
  "Research Compounds": "compounds",
  "Research Solutions": "solutions",
};

/**
 * The cards the Batch Report Library renders.
 *
 * A report that links to no product is left out entirely: `unmatched` means
 * the compound is no longer sold, and a library of certificates for things
 * nobody can buy is a support ticket waiting to happen. Everything the feed
 * cannot carry - photograph, element id, a locally hosted certificate, and
 * the order the cards list in - comes from `labReportCards`.
 */
export function toDirectoryReports(
  reports: LabReport[],
  products: Product[],
): DirectoryReport[] {
  const byKey = new Map(products.map((product) => [product.id, product]));
  const cards = new Map(
    labReportCards.map((card, order) => [card.title, { card, order }]),
  );
  return reports
    .filter((report) => report.link !== "unmatched")
    .map((report, index) => {
      const product = report.product_key ? byKey.get(report.product_key) : undefined;
      const known = cards.get(normaliseReportTitle(report.title));
      const image = known?.card.image ?? product?.image;
      const previous = report.previous;
      return {
        /* Named cards keep their published order; anything new lists after
           them, newest first, which is the order the feed arrives in. */
        order: known?.order ?? labReportCards.length + index,
        card: {
          category: product ? (directoryCategories[product.category] ?? "") : "",
          coa: known?.card.coa ?? report.report,
          fields: directoryFields(report),
          id: known?.card.id ?? `report-${report.id}`,
          image: image || null,
          previous: previous?.href
            ? [{ label: previousLot(previous.label), url: previous.href }]
            : [],
          purity: purityText(report.purity),
          title: report.title,
          sourceCoa: report.report,
          pending: reportPending(report),
        },
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.card);
}

/**
 * The three collections the pages used to import from files in `src/lib`,
 * built from the published reports and the catalogue that names the products.
 *
 * A superseded lot appears in both: as a `historical` batch, and as the
 * archived record the product page links to as the previous batch. The
 * `previous` link on a report is archived too, because an older certificate
 * is often a field on the newer report rather than a report of its own.
 */
export function mapLabReports(
  reports: LabReport[],
  products: Product[],
): LabReportLibrary {
  const resolved = resolve(reports, products);
  const batches: Batch[] = [];
  const archivedReports: ArchivedReport[] = [];
  const archivedUrls = new Set<string>();

  function archive(entry: ArchivedReport) {
    if (!entry.report || archivedUrls.has(entry.report)) return;
    archivedUrls.add(entry.report);
    archivedReports.push(entry);
  }

  for (const entry of resolved) {
    const batch = toBatch(entry);
    if (batch) batches.push(batch);
    if (entry.status === "historical" && entry.report.lot) {
      archive(toArchived(entry, purityNumber(entry.report.purity)));
    }
    const previous = entry.report.previous;
    if (previous?.href) {
      archive({
        lot: previousLot(previous.label),
        product: entry.product.name,
        strength: entry.report.strength,
        category: entry.product.category,
        report: previous.href,
        status: "historical",
      });
    }
  }
  return { batches, archivedReports, reports: toDirectoryReports(reports, products) };
}

/** The lots on sale for one product, newest first - the product page's list. */
export function currentBatchesFor(productName: string, batches: Batch[]) {
  return batches
    .filter((batch) => batch.product === productName && batch.status === "current")
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* The product page's own shape. Kept here so it can be pinned by a test; the
   formatting is the page's, unchanged, except that an unrecorded date prints
   as nothing rather than as "Invalid Date". */
export function productReportsFor(
  productName: string,
  current: Batch[],
  archivedReports: ArchivedReport[],
): ProductReport[] {
  return current.map((batch) => {
    const previous = archivedReports.find(
      (item) => item.product === productName && item.strength === batch.strength,
    );
    return {
      lot: batch.lot,
      date: batch.date
        ? new Date(batch.date + "T12:00:00").toLocaleDateString("en-US")
        : "",
      purity: batch.purity === undefined ? "" : `${batch.purity.toFixed(2)}% purity`,
      report: batch.report,
      checks: Object.entries(batch.checks ?? {}).map(
        ([key, value]) => `${key} â€” ${value}`,
      ),
      weight: batch.weight ? `Measured content: ${batch.weight}` : "",
      previous: previous
        ? { label: `Previous batch: ${previous.lot}`, href: previous.report }
        : null,
    };
  });
}

export type FeedState = { lastGood: LabReport[] | null };

/**
 * Read the feed, or serve the last one that worked.
 *
 * A certificate library that empties itself because WordPress was slow is a
 * worse answer than an hour-old one, so a failure never replaces a good feed.
 * A process whose very first read fails has nothing to serve and says so with
 * an empty list, which the pages already render as their empty state.
 */
export async function readOrLastGood(
  state: FeedState,
  read: () => Promise<LabReport[]>,
  onFailure?: (error: unknown) => void,
): Promise<LabReport[]> {
  try {
    const reports = await read();
    state.lastGood = reports;
    return reports;
  } catch (error) {
    onFailure?.(error);
    return state.lastGood ?? [];
  }
}

/** Parse a whole `tpc/v1/lab-reports` body, or refuse it. */
export function readLabReportsPayload(body: unknown): LabReport[] {
  const parsed = labReportsPayload.safeParse(body);
  if (!parsed.success) {
    throw new LabReportContractError(
      `The lab report feed did not match contract 1: ${parsed.error.issues[0]?.message ?? "unreadable"}.`,
    );
  }
  return parsed.data.reports;
}
