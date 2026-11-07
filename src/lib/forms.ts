import { z } from "zod";

export const formLocale = z.enum(["en", "es"]);

export const newsletterInput = z.object({
  email: z.string().trim().email().max(254),
  locale: formLocale.default("en"),
  source: z.enum(["popup", "footer"]).default("footer"),
});
export type NewsletterInput = z.infer<typeof newsletterInput>;

export const contactInput = z.object({
  name: z.string().trim().max(200),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().max(5000),
  website: z.string().max(200).default(""),
  turnstileToken: z.string().trim().min(1).max(2048),
  locale: formLocale.default("en"),
});
export type ContactInput = z.infer<typeof contactInput>;
