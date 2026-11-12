"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import {
  DECLARATION_FIELDS,
  RESEARCH_STATUSES,
  type DeclarationAnswers,
  type ResearchStatus,
} from "@/lib/research-declaration";
import { inputClass } from "./ui";

/* The research declaration every new account makes, as the WordPress gate
   asks it: a research status, the 21+ qualified-researcher statement, and
   acceptance of the policies. */

const statusLabels: Record<ResearchStatus, string> = {
  "independent-researcher": "Independent researcher",
  md: "MD",
  "research-foundation": "Research foundation",
  "research-institute": "Research institute",
  "analytical-laboratory": "Analytical laboratory",
};

function Check2({
  name,
  checked,
  invalid,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  invalid: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-6 text-[#49394F]">
      <input
        type="checkbox"
        name={name}
        value="1"
        checked={checked}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`peer-focus-visible:ring-primary/40 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border peer-focus-visible:ring-2 ${
          checked
            ? "border-primary bg-primary text-white"
            : invalid
              ? "border-red-400 bg-white text-transparent"
              : "border-[#D9C9DC] bg-white text-transparent"
        }`}
      >
        <Check size={13} strokeWidth={3} />
      </span>
      <span>{children}</span>
    </label>
  );
}

export function ResearchDeclarationFields({
  value,
  onChange,
  missing,
  idPrefix,
}: {
  value: DeclarationAnswers;
  onChange: (next: DeclarationAnswers) => void;
  missing: readonly string[];
  idPrefix: string;
}) {
  const flagged = (key: string) => missing.includes(key);
  return (
    <fieldset className="space-y-4 rounded-xl border border-[#E8DCEA] bg-white p-4">
      <legend className="text-gold px-1 text-[12px] font-bold tracking-widest uppercase">
        Research declaration
      </legend>
      <label
        htmlFor={`${idPrefix}-status`}
        className="block text-[14px] font-semibold text-[#49394F]"
      >
        Research status
        <select
          id={`${idPrefix}-status`}
          name={DECLARATION_FIELDS.status}
          value={value.status}
          required
          aria-invalid={flagged("status") || undefined}
          onChange={(event) =>
            onChange({ ...value, status: event.target.value })
          }
          className={`${inputClass} mt-2`}
        >
          <option value="">Select one</option>
          {RESEARCH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      {flagged("status") && (
        <p role="alert" className="text-[13px] text-red-600">
          Select your research status.
        </p>
      )}
      <Check2
        name={DECLARATION_FIELDS.attest}
        checked={value.attest}
        invalid={flagged("attest")}
        onChange={(attest) => onChange({ ...value, attest })}
      >
        I am 21 or older and a qualified researcher purchasing solely for in
        vitro laboratory research, not for human or veterinary use.
      </Check2>
      {flagged("attest") && (
        <p role="alert" className="text-[13px] text-red-600">
          Confirm this statement to continue.
        </p>
      )}
      <Check2
        name={DECLARATION_FIELDS.accept}
        checked={value.accept}
        invalid={flagged("accept")}
        onChange={(accept) => onChange({ ...value, accept })}
      >
        I accept the{" "}
        <Link
          href="/terms-and-conditions"
          className="text-primary font-semibold underline"
        >
          Terms
        </Link>
        ,{" "}
        <Link
          href="/privacy-policy"
          className="text-primary font-semibold underline"
        >
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link
          href="/research-disclaimer"
          className="text-primary font-semibold underline"
        >
          Research-Use-Only policy
        </Link>
        .
      </Check2>
      {flagged("accept") && (
        <p role="alert" className="text-[13px] text-red-600">
          Accept the Terms, Privacy Policy and Research-Use-Only policy to
          continue.
        </p>
      )}
    </fieldset>
  );
}
