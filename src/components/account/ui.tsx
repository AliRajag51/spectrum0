"use client";

import type { ChangeEvent, ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/* Shared building blocks of the account pages: Spectrum's field, button,
   panel and empty-state styles, plus the error wording for tRPC failures. */

export const inputClass =
  "h-12 w-full rounded-xl border border-[#E8DCEA] bg-white px-4 text-[15px] text-[#34283A] outline-none focus:border-primary";

export function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  required = true,
  minLength,
  maxLength,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block text-[14px] font-semibold text-[#49394F]">
      {label}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={`${inputClass} mt-2`}
      />
      {hint && <span className="mt-2 block text-[13px] font-normal text-[#817586]">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  busy = false,
  busyLabel = "Please wait...",
}: {
  children: ReactNode;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="btn-gradient"
    >
      {busy ? busyLabel : children}
      <ArrowUpRight size={17} />
    </button>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#ECE2ED] bg-white p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-primary text-[25px] font-bold">{title}</h2>
          {subtitle && <p className="mt-2 text-[14px] leading-6 text-[#817586]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({
  icon: Icon,
  title,
  description,
  href,
  action,
}: {
  icon: ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#E6D9E8] bg-[#FCFAFC] px-5 py-10 text-center">
      <Icon className="text-primary/60 mx-auto" size={34} />
      <h3 className="font-heading text-primary mt-4 text-[22px] font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-7 text-[#817586]">{description}</p>
      {href && (
        <Link
          href={href}
          className="bg-primary mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white"
        >
          {action}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function FormError({ message, className = "" }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`text-[14px] text-red-600 ${className}`}>
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-primary text-[14px]">
      {message}
    </p>
  );
}

/* Zod messages arrive as stable "account.*" codes; anything else (a WordPress
   or bridge message such as "accounts are not connected") is already written
   for a customer and is shown as-is. */
const errorCopy: Record<string, string> = {
  "account.email_invalid": "Enter a valid email address.",
  "account.email_too_long": "That email address is too long.",
  "account.password_too_short": "Use at least 8 characters.",
  "account.password_too_long": "That password is too long.",
  "account.name_too_long": "Use 80 characters or fewer.",
  "account.password_required": "Enter your password.",
  "account.address1_required": "Enter a street address.",
  "account.city_required": "Enter a city.",
  "account.country_required": "Choose a country.",
  "account.current_password_required": "Enter your current password.",
  "account.email_or_username_required": "Enter your email address or username.",
  "account.email_or_username_too_long": "That is too long.",
  "account.reset_link_invalid": "That password reset link is not valid.",
  "account.declaration_status_required": "Select your research status.",
  "account.declaration_attest_required": "Confirm the research statement to continue.",
  "account.declaration_accept_required":
    "Accept the Terms, Privacy Policy and Research-Use-Only policy to continue.",
};

const CODE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const TRANSPORT_PATTERN =
  /is not valid JSON|Unexpected token|Unexpected end of JSON|JSON\.parse|<!DOCTYPE|Failed to fetch|NetworkError|Load failed|network connection was lost/i;

export function formError(message: string | undefined | null): string | undefined {
  if (!message) return undefined;
  if (TRANSPORT_PATTERN.test(message))
    return "We couldn't reach the store just now. Please try again in a moment.";
  if (CODE_PATTERN.test(message))
    return errorCopy[message] ?? "Check the details you entered and try again.";
  return message;
}
