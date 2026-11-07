"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  FileCheck2,
  FileSearch,
  Search,
  FileText,
  X,
} from "lucide-react";

import {
  filterLabReports,
  labCategories,
  type LabCategory,
  type LabReport,
} from "@/lib/lab-reports";
import CustomSelect from "../CustomSelect";

function CoACard({ report }: { report: LabReport }) {
  const lot = report.fields.find((field) => field.label === "Lot")?.value;

  return (
    <>
      <article className="group hover:border-primary/20 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#EAE0EC] bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(85,32,95,0.08)]">
        <div className="relative aspect-square overflow-hidden bg-[#F8F0FA]">
          {report.image ? (
            <Image
              src={report.image}
              alt={report.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="text-primary/40 flex h-full items-center justify-center text-sm">
              Image unavailable
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h2
            id={report.id}
            className="font-heading text-primary group-hover/title:text-secondary text-[16px] leading-[1.35] font-semibold tracking-[-0.04em] transition-colors sm:text-[18px]"
          >
            {report.title}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {report.purity && (
              <span className="border-primary bg-primary rounded-full border px-3 py-1.5 text-[11px] font-semibold text-white">
                {report.purity} purity
              </span>
            )}
            {lot && (
              <span className="text-primary rounded-full border border-[#E8DCEA] bg-white px-3 py-1.5 text-[11px] font-semibold">
                Lot {lot}
              </span>
            )}
          </div>

          {report.pending ? (
            <span className="text-primary/70 mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#E8DCEA] px-4 text-sm font-semibold">
              <FileText size={16} />
              Results pending
            </span>
          ) : (
            <a
              href={report.coa}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={report.id}
              className="bg-primary mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#35143E]"
            >
              View COA
            </a>
          )}
        </div>
      </article>
    </>
  );
}

export default function CoALibrary({ reports }: { reports: LabReport[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LabCategory>("all");
  /* Only offer the categories that actually have a report. */
  const categories = useMemo(
    () =>
      labCategories.filter(
        (item) =>
          item.key !== "all" &&
          reports.some((report) => report.category === item.key),
      ),
    [reports],
  );
  const filtered = useMemo(
    () => filterLabReports(reports, query, category),
    [reports, query, category],
  );

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[#EEE6EF] px-4 py-6 sm:px-6 md:py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            Spectrum Biosciences
          </p>
          <h1 className="section-heading">
            Certificates of <span className="text-secondary">Analysis.</span>
          </h1>
          <p className="text-md mt-2 max-w-2xl text-[#817586]">
            Browse the published, batch-specific Certificates of Analysis for
            Spectrum Biosciences research products.
          </p>
        </div>
      </header>

      <section
        aria-label="Certificate of Analysis library"
        className="relative px-4 py-10 sm:px-6 sm:py-14 lg:px-10"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex min-w-0 flex-col gap-3 border-b border-[#EEE6EF] pb-6 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative w-full min-w-0 sm:flex-1 lg:max-w-[390px]">
              <Search
                size={17}
                className="text-primary/60 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 sm:left-4"
              />
              <label htmlFor="coa-search" className="sr-only">
                Search products or batches
              </label>
              <input
                id="coa-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search compounds..."
                className="focus:border-primary h-11 w-full min-w-0 rounded-2xl border border-[#E8DCEA] bg-white pr-9 pl-9 text-[12px] text-[#29232D] outline-none placeholder:text-[#A69BA9] sm:h-12 sm:pl-11 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="text-primary absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full hover:bg-[#F6E5F7]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <CustomSelect
              id="coa-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as LabCategory)}
              placeholder="Filter category"
              className="w-full sm:w-[190px] sm:shrink-0 lg:ml-auto"
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((item) => ({
                  value: item.key,
                  label: item.label,
                })),
              ]}
            />
          </div>
          {reports.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <FileSearch size={33} className="text-primary/30" />
              <h2 className="font-heading text-primary mt-4 text-xl font-bold">
                Certificates coming soon
              </h2>
              <p className="mt-2 max-w-md text-sm text-[#817586]">
                Batch certificates will be listed here as soon as they are
                published. Contact us if you need documentation for a current
                lot.
              </p>
            </div>
          ) : filtered.length ? (
            <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((report) => (
                <CoACard key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <FileSearch size={33} className="text-primary/30" />
              <h2 className="font-heading text-primary mt-4 text-xl font-bold">
                No matching records
              </h2>
              <p className="mt-2 text-sm text-[#817586]">
                Try another compound, strength, or filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
                className="bg-primary mt-5 rounded-full px-5 py-3 text-xs font-semibold text-white"
              >
                Clear filters
              </button>
            </div>
          )}
          <p className="mt-12 flex items-start gap-2 border-t border-[#EEE6EF] pt-5 text-xs leading-6 text-[#817586]">
            <FileCheck2 size={17} className="text-primary mt-0.5 shrink-0" />
            Certificates are issued per batch by the testing laboratory and
            reflect the lot named on each report. Research use only.
          </p>
        </div>
      </section>
    </main>
  );
}
