"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ArrowRight, FlaskConical, Mail } from "lucide-react";
import "remixicon/fonts/remixicon.css";

type FooterLink = { name: string; href: string };

const footerLinks: Record<"explore" | "support" | "policies", FooterLink[]> = {
  explore: [
    { name: "Shop All", href: "/shop" },
    { name: "COA", href: "/coa" },
    { name: "Partner Program", href: "/partner-program" },
    { name: "Track order", href: "/track-order" },
  ],
  support: [
    { name: "About", href: "/about" },
    { name: "FAQs", href: "/faqs" },
    { name: "Contact", href: "/contact" },
  ],
  policies: [
    { name: "Privacy Policy", href: "/privacy-policy" },
    { name: "Terms & Conditions", href: "/terms-and-conditions" },
    { name: "Refund Policy", href: "/refund-policy" },
    { name: "Research Disclaimer", href: "/research-disclaimer" },
  ],
};

const socials = [
  {
    name: "Instagram",
    href: "https://instagram.com",
    icon: "ri-instagram-line",
  },
  { name: "Facebook", href: "https://facebook.com", icon: "ri-facebook-fill" },
  { name: "X", href: "https://x.com", icon: "ri-twitter-x-line" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h3 className="font-heading text-primary text-md mb-5 font-semibold">
        {title}
      </h3>

      <ul className="space-y-3.5">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              href={link.href}
              className="group hover:text-primary inline-flex items-center gap-1.5 font-sans text-sm text-[#786E7B] transition-colors duration-300"
            >
              <span>{link.name}</span>
              <ArrowUpRight
                size={12}
                className="opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) return;

    // Connect this form to your newsletter API.
  };

  return (
    <footer className="relative overflow-hidden bg-[#FCF6F0] text-[#29232D]">
      <div className="relative px-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="border-primary/10 grid gap-10 border-b py-14 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr]">
            <div className="max-w-[320px]">
              <Link href="/" aria-label="Spectrum Biosciences home">
                <Image
                  src="/assets/spectrum-logo.png"
                  alt="Spectrum Biosciences"
                  width={200}
                  height={70}
                  className="h-[60px] w-auto object-contain"
                />
              </Link>

              <p className="mt-5 font-sans text-sm text-[#786E7B]">
                Spectrum Biosciences brings together a curated range of
                research-focused compounds for laboratory applications and
                scientific exploration.
              </p>

              <div className="mt-6 flex items-center gap-2">
                {socials.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.name}
                    className="border-primary/10 text-primary hover:border-primary hover:bg-primary flex h-10 w-10 items-center justify-center rounded-full border bg-white transition-all duration-300 hover:-translate-y-1 hover:text-white"
                  >
                    <i
                      className={`${social.icon} text-[17px]`}
                      aria-hidden="true"
                    />
                  </a>
                ))}
              </div>
            </div>

            <FooterColumn title="Explore" links={footerLinks.explore} />

            <FooterColumn title="Company" links={footerLinks.support} />

            <FooterColumn title="Policies" links={footerLinks.policies} />
          </div>

          <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-sans text-[11px] text-[#8B7E8E] sm:text-[12px]">
              © {new Date().getFullYear()} Spectrum Biosciences. All rights
              reserved.
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/privacy-policy"
                className="hover:text-primary font-sans text-[11px] text-[#8B7E8E] transition-colors"
              >
                Privacy
              </Link>

              <Link
                href="/terms-and-conditions"
                className="hover:text-primary font-sans text-[11px] text-[#8B7E8E] transition-colors"
              >
                Terms
              </Link>

              <span className="text-primary inline-flex items-center gap-2 font-sans text-[11px] font-semibold">
                <FlaskConical size={14} className="text-secondary" />
                Research Use Only
              </span>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none mt-6 w-full select-none"
          >
            <svg
              viewBox="0 0 1000 150"
              preserveAspectRatio="none"
              className="block h-auto w-full"
            >
              <defs>
                <linearGradient id="spectrumFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8D8EB" />
                  <stop offset="100%" stopColor="#E8D8EB" stopOpacity="0" />
                </linearGradient>
              </defs>
              <text
                x="500"
                y="125"
                textAnchor="middle"
                textLength="980"
                lengthAdjust="spacingAndGlyphs"
                fill="url(#spectrumFade)"
                fontFamily="var(--font-sora), sans-serif"
                fontSize="145"
                fontWeight="800"
              >
                SPECTRUM
              </text>
            </svg>
          </div>
        </div>
      </div>
    </footer>
  );
}
