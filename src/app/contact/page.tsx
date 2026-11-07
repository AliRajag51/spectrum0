"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Package, FileCheck2, Headphones } from "lucide-react";
import CustomSelect from "@/components/CustomSelect";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

declare global {
  interface Window {
    spectrumContactTurnstile?: (token: string) => void;
    spectrumContactTurnstileExpired?: () => void;
    turnstile?: { reset: () => void };
  }
}

const email = env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
/* The site plugin verifies a Turnstile token on every message, so without a
   site key the form cannot send and says so instead of failing on submit. */
const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const subjects = [
  "Product question",
  "Order support",
  "Laboratory documentation",
  "General inquiry",
];

type ContactFields = {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Honeypot; real visitors never see or fill it. */
  website: string;
};

const emptyForm: ContactFields = {
  name: "",
  email: "",
  subject: subjects[0] ?? "",
  message: "",
  website: "",
};

type Notice = { tone: "success" | "error"; text: string };

export default function ContactPage() {
  const [form, setForm] = useState<ContactFields>(emptyForm);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const trpc = useTRPC();
  const send = useMutation(
    trpc.contact.send.mutationOptions({
      onSuccess: () => {
        setNotice({
          tone: "success",
          text: "Thank you. Your message has been sent and our team will reply by email.",
        });
        setForm(emptyForm);
        setTurnstileToken("");
        window.turnstile?.reset();
      },
      onError: (error) => {
        setNotice({
          tone: "error",
          text:
            error.message ||
            "We couldn't send your message. Please try again shortly.",
        });
        setTurnstileToken("");
        window.turnstile?.reset();
      },
    }),
  );

  useEffect(() => {
    window.spectrumContactTurnstile = setTurnstileToken;
    window.spectrumContactTurnstileExpired = () => setTurnstileToken("");
    return () => {
      delete window.spectrumContactTurnstile;
      delete window.spectrumContactTurnstileExpired;
    };
  }, []);

  const update = (event: { target: { name: string; value: string } }) =>
    setForm((value) => ({ ...value, [event.target.name]: event.target.value }));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (send.isPending) return;
    if (!event.currentTarget.reportValidity()) return;
    if (!turnstileSiteKey) {
      setNotice({
        tone: "error",
        text: "The contact form isn't connected yet. Please try again later.",
      });
      return;
    }
    if (!turnstileToken) {
      setNotice({
        tone: "error",
        text: "Please complete the verification check before sending.",
      });
      return;
    }
    setNotice(null);
    send.mutate({ ...form, turnstileToken, locale: "en" });
  };

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[#EEE6EF] px-4 py-6 sm:px-6 md:py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex items-center gap-2 text-xs text-[#95879A]"
          >
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <ChevronRight size={13} />
            <span className="text-primary font-semibold">Contact</span>
          </nav>

          <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            Get in touch
          </p>
          <h1 className="section-heading">
            We're Here to <span className="text-secondary">Help.</span>
          </h1>
          <p className="text-md mt-3 max-w-xl text-[#817586]">
            Have a question about a product, order, or batch documentation? Send
            us a message.
          </p>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20 lg:px-8">
        <aside className="order-2 lg:order-1 lg:pt-2">
          <h2 className="font-heading text-primary text-2xl font-bold tracking-tight">
            Contact Spectrum
          </h2>
          <p className="text-md mt-3 max-w-sm text-[#817586]">
            Our team can assist with product information, research
            documentation, and questions about your order.
          </p>
          <div className="mt-8 space-y-6">
            <div className="flex items-start gap-3">
              <span className="text-primary grid size-11 shrink-0 place-items-center rounded-2xl bg-[#F6E5F7]">
                <Mail size={19} />
              </span>
              <div>
                <h3 className="text-md font-semibold text-[#29232D]">
                  Email us
                </h3>
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="text-primary hover:text-secondary text-md mt-1 block break-all"
                  >
                    {email}
                  </a>
                ) : (
                  <p className="text-sm text-[#817586]">
                    Email address will appear here once configured.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary grid size-11 shrink-0 place-items-center rounded-2xl bg-[#F6E5F7]">
                <MessageCircle size={19} />
              </span>
              <div>
                <h3 className="text-md font-semibold text-[#29232D]">
                  Product questions
                </h3>
                <p className="text-md text-[#817586]">
                  Select a topic and tell us what you'd like to know.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary grid size-11 shrink-0 place-items-center rounded-2xl bg-[#F6E5F7]">
                <ShieldCheck size={19} />
              </span>
              <div>
                <h3 className="text-md font-semibold text-[#29232D]">
                  Research use only
                </h3>
                <p className="text-sm text-[#817586]">
                  We do not provide personal use, dosing, or administration
                  guidance.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-9 border-t border-[#EEE6EF] pt-6">
            <p className="text-sm font-semibold text-[#29232D]">
              Looking for quick answers?
            </p>
            <Link
              href="/faqs"
              className="text-primary hover:text-secondary mt-2 inline-flex items-center gap-2 text-sm font-semibold"
            >
              Visit FAQs <ArrowUpRight size={16} />
            </Link>
          </div>
        </aside>
        <section
          aria-labelledby="contact-form-heading"
          className="order-1 rounded-[24px] border border-[#EEE6EF] p-5 sm:p-8 lg:order-2"
        >
          <h2
            id="contact-form-heading"
            className="font-heading text-primary text-2xl font-semibold tracking-tight"
          >
            Send an Inquiry
          </h2>
          <p className="text-md mt-2 text-[#817586]">
            Fill in the details below and we&apos;ll reply by email.
          </p>
          {turnstileSiteKey && (
            <Script
              id="cloudflare-turnstile"
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
          )}
          <form onSubmit={submit} className="relative mt-7 space-y-5">
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              <label>
                Leave this field empty
                <input
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={update}
                />
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-name"
                  className="mb-2 block text-sm font-semibold text-[#29232D]"
                >
                  Full name <span className="text-secondary">*</span>
                </label>
                <input
                  id="contact-name"
                  name="name"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={update}
                  placeholder="Your name"
                  className="focus:border-primary h-12 w-full rounded-xl border border-[#E8DCEA] px-4 text-sm outline-none placeholder:text-[#B2A6B5]"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-email"
                  className="mb-2 block text-sm font-semibold text-[#29232D]"
                >
                  Email address <span className="text-secondary">*</span>
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={update}
                  placeholder="you@example.com"
                  className="focus:border-primary h-12 w-full rounded-xl border border-[#E8DCEA] px-4 text-sm outline-none placeholder:text-[#B2A6B5]"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="contact-subject"
                className="mb-2 block text-sm font-semibold text-[#29232D]"
              >
                What can we help with?
              </label>
              <CustomSelect
                id="contact-subject"
                value={form.subject}
                onChange={(event) =>
                  update({
                    target: { name: "subject", value: event.target.value },
                  })
                }
                placeholder="Select a subject"
                className="w-full"
                options={subjects.map((subject) => ({
                  value: subject,
                  label: subject,
                }))}
              />
            </div>
            <div>
              <label
                htmlFor="contact-message"
                className="mb-2 block text-sm font-semibold text-[#29232D]"
              >
                Your message <span className="text-secondary">*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                value={form.message}
                onChange={update}
                placeholder="Tell us how we can help..."
                className="focus:border-primary w-full resize-y rounded-xl border border-[#E8DCEA] px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-[#B2A6B5]"
              />
            </div>
            {turnstileSiteKey && (
              <div
                className="cf-turnstile"
                data-sitekey={turnstileSiteKey}
                data-action="contact"
                data-size="flexible"
                data-theme="light"
                data-callback="spectrumContactTurnstile"
                data-expired-callback="spectrumContactTurnstileExpired"
              />
            )}
            <button
              type="submit"
              disabled={send.isPending}
              className="group bg-primary flex h-12 w-full items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold text-white transition-colors hover:bg-[#35143E] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {send.isPending ? "Sending..." : "Send Message"}{" "}
              <ArrowUpRight
                size={17}
                className="transition-transform group-hover:rotate-45"
              />
            </button>
            {notice && (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={`flex items-start gap-2 text-xs leading-relaxed ${
                  notice.tone === "error" ? "text-red-600" : "text-primary"
                }`}
              >
                <CheckCircle2 size={16} className="shrink-0" />
                {notice.text}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-[#978A9A]">
              Your message is sent securely to the Spectrum Biosciences team.
              We never ask for payment details by email.
            </p>
          </form>
        </section>
      </section>

      <section className="border-t border-[#EEE6EF] bg-[#FCFAFC] px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-secondary mb-3 text-[11px] font-bold tracking-[0.16em] uppercase">
              Customer Support
            </p>
            <h2 className="section-heading">How Can We Help?</h2>
            <p className="text-md mt-3 text-[#817586]">
              Whether you're exploring our collection or have questions about an
              existing order, we're here to help you find the right information.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Package,
                title: "Orders & Shipping",
                description:
                  "Questions about order details, shipping information, or an existing purchase.",
                link: "/faqs",
                action: "View FAQs",
              },
              {
                icon: FileCheck2,
                title: "Product Documentation",
                description:
                  "Learn about available product specifications, batch information, and laboratory documentation.",
                link: "/shop",
                action: "Explore Products",
              },
              {
                icon: Headphones,
                title: "General Inquiries",
                description:
                  "Need assistance with something else? Share your question through our contact form.",
                link: "#contact-form-heading",
                action: "Contact Us",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="group hover:border-primary/20 rounded-[20px] border border-[#EEE6EF] bg-white p-6 transition-all duration-300 hover:shadow-[0_15px_35px_rgba(85,32,95,0.05)] sm:p-7"
                >
                  <div className="text-primary flex size-12 items-center justify-center rounded-2xl bg-[#F6E5F7]">
                    <Icon size={23} strokeWidth={1.6} />
                  </div>
                  <h3 className="font-heading text-primary mt-6 text-xl font-bold tracking-[-0.03em]">
                    {item.title}
                  </h3>
                  <p className="text-md mt-3 min-h-[72px] text-[#817586]">
                    {item.description}
                  </p>
                  <Link
                    href={item.link}
                    className="text-primary hover:text-secondary text-md mt-6 inline-flex items-center gap-2 font-semibold transition-colors"
                  >
                    {item.action}
                    <ArrowUpRight
                      size={16}
                      className="transition-transform duration-300 group-hover:rotate-45"
                    />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 border-b border-[#EEE6EF] pb-12 sm:flex-row sm:items-center">
          <div>
            <p className="text-secondary mb-3 text-[11px] font-bold tracking-[0.16em] uppercase">
              Frequently Asked Questions
            </p>
            <h2 className="section-heading">Need More Information?</h2>
            <p className="text-md mt-3 max-w-xl text-[#817586]">
              Find answers to common questions about our research products,
              ordering, and documentation.
            </p>
          </div>

          <Link
            href="/faqs"
            className="group bg-primary inline-flex shrink-0 items-center gap-4 rounded-full py-2 pr-2 pl-6 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[#35143E]"
          >
            Explore FAQs
            <span className="text-primary flex size-10 items-center justify-center rounded-full bg-white transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight size={19} />
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
