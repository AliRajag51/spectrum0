import { z } from "zod";

/* The research declaration every new account makes (payment processor rules
 * R1–R4), as the live WordPress gate asks it: a research status, a 21+
 * qualified-researcher statement, and acceptance of the terms, privacy and
 * research-use-only policies. It is stored on the WordPress account by the
 * gate's own TPC_Gate::save_declaration, so records from the storefront and
 * from WordPress are the same records.
 *
 * Pure, for the forms, the server routes and the tests alike. */

export const RESEARCH_STATUSES = [
  "independent-researcher",
  "md",
  "research-foundation",
  "research-institute",
  "analytical-laboratory",
] as const;

export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const declarationInput = z.object({
  status: z.enum(RESEARCH_STATUSES, { error: "account.declaration_status_required" }),
  attest: z.literal(true, { error: "account.declaration_attest_required" }),
  accept: z.literal(true, { error: "account.declaration_accept_required" }),
  /** The language the answers were given in. */
  lang: z.enum(["en", "es"]).default("en"),
});

export type Declaration = z.infer<typeof declarationInput>;

export type DeclarationAnswers = { status: string; attest: boolean; accept: boolean };

export const emptyDeclaration: DeclarationAnswers = { status: "", attest: false, accept: false };

/** Which answers are still missing, in the order the form shows them. */
export function missingDeclaration(answers: DeclarationAnswers): ("status" | "attest" | "accept")[] {
  const missing: ("status" | "attest" | "accept")[] = [];
  if (!(RESEARCH_STATUSES as readonly string[]).includes(answers.status)) missing.push("status");
  if (!answers.attest) missing.push("attest");
  if (!answers.accept) missing.push("accept");
  return missing;
}

/** The answers as form fields, for the sign-up buttons that post a form (Google, Facebook). */
export const DECLARATION_FIELDS = { status: "tpc_research_status", attest: "tpc_attest", accept: "tpc_accept" } as const;

/** Read posted form fields back into a declaration, or null when any answer is missing. */
export function declarationFromForm(form: FormData, lang: string): Declaration | null {
  const parsed = declarationInput.safeParse({
    status: String(form.get(DECLARATION_FIELDS.status) ?? ""),
    attest: form.get(DECLARATION_FIELDS.attest) === "1",
    accept: form.get(DECLARATION_FIELDS.accept) === "1",
    lang: lang === "es" ? "es" : "en",
  });
  return parsed.success ? parsed.data : null;
}

/** A form's answers as the declaration to send, or null while any is missing. */
export function toDeclaration(answers: DeclarationAnswers, locale: string): Declaration | null {
  const parsed = declarationInput.safeParse({ ...answers, lang: locale === "es" ? "es" : "en" });
  return parsed.success ? parsed.data : null;
}

/* ---------------------------------------------------- at checkout, per order */

/* The research declaration on every order (the payment processor's policy,
 * requirement 4), as WordPress's tpc-r4-declaration plugin (0.2.1, wording
 * 2026-09-28) enforces it: one of the same five purposes, and the
 * research-use confirmation. Store API checkout refuses an order without
 * them (400 tpc_r4_declaration_required) before stock or payment. */

/** The Store API extension namespace the plugin reads. */
export const ORDER_DECLARATION_NAMESPACE = "tpc-r4";

export const orderDeclarationInput = z.object({
  purpose: z.enum(RESEARCH_STATUSES, { error: "Please select what you are purchasing as." }),
  confirm: z.literal(true, {
    error: "Please confirm that the products in this order are purchased for research use only and not for human consumption.",
  }),
});

export type OrderDeclaration = z.infer<typeof orderDeclarationInput>;

/** The order's `extensions` entry, exactly as the plugin's Store API schema takes it. */
export function orderDeclarationExtension(declaration: OrderDeclaration) {
  return { [ORDER_DECLARATION_NAMESPACE]: { purpose: declaration.purpose, confirm: true } };
}

/** The declaration to send without asking, or null when checkout must ask.
    Only when WordPress says the account owes none (`declaration_owed: false`)
    and gives the answer to send (`r4_prefill`): with no answer, the step stays. */
export function researchOnFile(
  tpc: { declaration_owed?: boolean; r4_prefill?: { purpose: ResearchStatus } | null } | null | undefined,
): { purpose: ResearchStatus } | null {
  return tpc?.declaration_owed === false && tpc.r4_prefill ? { purpose: tpc.r4_prefill.purpose } : null;
}

/** Whether a signed-in account still owes the research step (/login/research).
    Only WordPress's `declaration_owed: false` skips it, so an account whose
    answer is on file is not asked twice (the agency, Oct 27: 48 of 62 new
    accounts were); with `tpc` or the field missing, it is still asked. */
export function declarationOwed(tpc: { declaration_owed?: boolean } | null | undefined): boolean {
  return tpc?.declaration_owed !== false;
}
