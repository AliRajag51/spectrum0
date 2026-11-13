import { matchesCompoundSearch } from "./search-aliases.ts";

/* One card of the Batch Report Library. `mapLabReports` builds these from the
   published feed; the shape is the one this file used to read out of a
   checked-in JSON file, so the components never had to change. */
export type LabReport = {
  /** Demonstration documents are labeled separately from lab-issued reports. */
  sample?: boolean;
  category: string;
  coa: string;
  fields: { label: string; value: string }[];
  id: string;
  image: string | null;
  previous: { label: string; url: string }[];
  purity: string | null;
  title: string;
  sourceCoa: string;
  pending: boolean;
};

export const labCategories = [
  { key: "all", label: "All" },
  { key: "peptides", label: "Peptides" },
  { key: "blends", label: "Blends" },
  { key: "compounds", label: "Compounds" },
  { key: "solutions", label: "Solutions" },
] as const;
export type LabCategory = (typeof labCategories)[number]["key"];

export function filterLabReports(
  reports: LabReport[],
  query: string,
  category: LabCategory,
) {
  return reports.filter((report) => {
    /* What identifies a report: its compound and its lot numbers, current and
       superseded. Deliberately NOT the measured content, which on a blend
       names every peptide in the vial - KLOW's reads "KPV 10.45mg, TB-500
       10.59mg, BPC-157 11.79mg, GHK-Cu 57.41mg", so searching it turned
       "bpc-157" into five results, three of them blends that merely contain
       some. Nor purity or date, which nobody searches by. */
    const text = [
      report.title,
      ...report.fields
        .filter((field) => field.label === "Lot")
        .map((field) => field.value),
      ...report.previous.map((batch) => batch.label),
    ].join(" ");
    return (
      (category === "all" || report.category === category) &&
      matchesCompoundSearch(query, text, report.title)
    );
  });
}
