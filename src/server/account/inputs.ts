import { z } from "zod";
import { declarationInput } from "../../lib/research-declaration.ts";

/* The shapes every account form is validated against.

   Kept free of `server-only`, `@/env` and the bridge - the same rule
   lab-report-mapping.ts follows - so the node test runner can parse a
   pretend sign-in without booting half the server.

   The messages are stable "namespace.key" codes, not English sentences:
   `errorFormatter` in src/server/api/trpc.ts puts the first issue's message
   on the wire unchanged, and `useFormError` (src/lib/use-form-error.ts) maps
   a recognized code to the signed-in visitor's language at render time. A
   code that isn't recognized (an upstream WordPress/WooCommerce message, for
   instance) is shown as-is, so nothing here can render a raw code to a
   customer by mistake. */

const email = z
  .string()
  .trim()
  .email("account.email_invalid")
  .max(320, "account.email_too_long");
const password = z
  .string()
  .min(8, "account.password_too_short")
  .max(200, "account.password_too_long");
const name = z.string().trim().max(80, "account.name_too_long");

export const signInInput = z.object({
  email,
  password: z.string().min(1, "account.password_required").max(200),
  /* "Keep me signed in". Off, the session cookie ends with the browser. */
  remember: z.boolean().default(true),
});

export const registerInput = z.object({
  email,
  /* Every new account makes the research declaration (payment processor
     rules R1–R4), as on the WordPress gate. */
  declaration: declarationInput,
  /* Absent on the access gate's email-only sign-up: WordPress generates the
     password and emails the link to set it. */
  password: password.optional(),
  firstName: name.optional(),
  lastName: name.optional(),
});

/* The end of "Continue with Facebook": an email only when Facebook gave none. */
export const facebookCompleteInput = z.object({
  email: email.optional(),
  declaration: declarationInput.optional(),
});

export const ordersInput = z.object({
  page: z.number().int().min(1).max(200).default(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export const orderInput = z.object({ id: z.number().int().positive() });

export const addressInput = z.object({
  kind: z.enum(["billing", "shipping"]),
  fields: z.object({
    firstName: name,
    lastName: name,
    company: z.string().trim().max(120).default(""),
    address1: z.string().trim().min(1, "account.address1_required").max(200),
    address2: z.string().trim().max(200).default(""),
    city: z.string().trim().min(1, "account.city_required").max(120),
    state: z.string().trim().max(120).default(""),
    postcode: z.string().trim().max(40).default(""),
    country: z.string().trim().length(2, "account.country_required"),
    email: z.union([email, z.literal("")]).default(""),
    phone: z.string().trim().max(40).default(""),
  }),
});

export const profileInput = z.object({
  firstName: name,
  lastName: name,
  displayName: z.string().trim().max(120).optional(),
  email,
  currentPassword: z.string().max(200).optional(),
});

export const passwordInput = z.object({
  currentPassword: z.string().min(1, "account.current_password_required").max(200),
  newPassword: password,
});

/* Not `email`: WordPress accepts a username here too, so this is the one
   field on the account pages that must not insist on an address. */
export const lostPasswordInput = z.object({
  email: z
    .string()
    .trim()
    .min(1, "account.email_or_username_required")
    .max(320, "account.email_or_username_too_long"),
});

export const resetPasswordInput = z.object({
  /* Not typed by anyone - it comes out of the emailed link - so the code
     is about the link rather than about a field. */
  key: z.string().min(1, "account.reset_link_invalid").max(200),
  login: z.string().trim().max(200).default(""),
  id: z.number().int().positive().optional(),
  newPassword: password,
});
