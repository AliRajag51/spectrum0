"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Minus,
  MessageCircle,
  FlaskConical,
  Sparkles,
  HelpCircle,
} from "lucide-react";

const categories = [
  "All Questions",
  "Orders",
  "Shipping",
  "Products",
  "Support",
];

type Faq = { category: string; question: string; answer: string };

const faqs: Faq[] = [
  {
    category: "Orders",
    question: "How do I place an order?",
    answer:
      "Browse our research product collection, select your preferred product and variant, and proceed through checkout to submit your order.",
  },
  {
    category: "Orders",
    question: "What happens after I place an order?",
    answer:
      "Once your order is received, its details are reviewed before the parcel is prepared and labelled for shipment. The review process usually takes 1–3 business days.",
  },
  {
    category: "Shipping",
    question: "How can I track my order?",
    answer:
      "Once tracking becomes available, your tracking information is sent to the email address associated with your order.",
  },
  {
    category: "Shipping",
    question: "Which shipping carrier do you use?",
    answer:
      "Our standard order process includes carrier handoff to UPS. Shipping options and availability may depend on your delivery location.",
  },
  {
    category: "Products",
    question: "Are Spectrum products intended for human use?",
    answer:
      "No. Spectrum research products are intended strictly for laboratory research purposes and are not for human consumption or clinical use.",
  },
  {
    category: "Products",
    question: "Where can I find product specifications?",
    answer:
      "Visit an individual product page to review its available variants, product details, and other published specifications.",
  },
  {
    category: "Products",
    question: "How do I check laboratory documentation?",
    answer:
      "Where laboratory documentation is provided, use the product's lot or batch information to identify the corresponding certificate. Contact support if you need help locating available documentation.",
  },
  {
    category: "Support",
    question: "How can I contact Spectrum?",
    answer:
      "You can reach out through our contact page with questions about products, orders, or available documentation.",
  },
];

function FAQItem({
  item,
  index,
  open,
  onToggle,
}: {
  item: Faq;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = open ? Minus : Plus;

  return (
    <article
      className={`group relative border-b transition-colors duration-500 ${
        open ? "border-primary/25" : "border-primary/10"
      }`}
    >
      <div
        className={`bg-secondary absolute bottom-0 left-0 h-[2px] transition-all duration-500 ${
          open ? "w-full" : "w-0"
        }`}
      />

      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-answer-${index}`}
          id={`faq-question-${index}`}
          className="flex w-full items-center gap-3 py-5 text-left sm:gap-5 sm:py-7"
        >
          <span
            className={`font-heading shrink-0 text-[12px] font-bold transition-colors duration-300 sm:text-[14px] ${
              open ? "text-secondary" : "text-primary/30"
            }`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>

          <span
            className={`font-heading min-w-0 flex-1 text-[16px] leading-snug font-semibold tracking-[-0.045em] transition-colors duration-300 sm:text-[20px] lg:text-[22px] ${
              open ? "text-primary" : "group-hover:text-primary text-[#29232D]"
            }`}
          >
            {item.question}
          </span>

          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-500 sm:h-11 sm:w-11 ${
              open
                ? "border-primary bg-primary rotate-180 text-white"
                : "border-primary/15 text-primary group-hover:border-primary bg-white group-hover:bg-[#F6E5F7]"
            }`}
          >
            <Icon size={19} strokeWidth={1.8} />
          </span>
        </button>
      </h3>

      <div
        id={`faq-answer-${index}`}
        role="region"
        aria-labelledby={`faq-question-${index}`}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pr-12 pb-7 pl-7 sm:pr-16 sm:pb-8 sm:pl-10">
            <p className="text-muted max-w-[540px] font-sans text-[13px] leading-[1.9] sm:text-[15px]">
              {item.answer}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Faqs() {
  const [category, setCategory] = useState("All Questions");
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  const filteredFAQs =
    category === "All Questions"
      ? faqs
      : faqs.filter((faq) => faq.category === category);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setActiveIndex(0);
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="relative overflow-hidden px-4 md:py-16 sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute top-1/3 -left-40 h-[450px] w-[450px] rounded-full bg-[#F6E5F7]/40 blur-[110px]" />

      <div className="relative mx-auto max-w-5xl">
        <header className="mx-auto max-w-[680px] text-center">
          <h2 id="faq-title" className="section-heading mt-2">
            Curious Minds.
            <br />
            <span className="text-secondary">Clear Answers.</span>
          </h2>

          <p className="text-muted text-md mx-auto mt-5 max-w-[500px] font-sans">
            Everything you need to know about Spectrum, from ordering and
            shipping to research product information.
          </p>
        </header>

        <div className="mx-auto mt-10 w-full max-w-7xl sm:mt-12 lg:mt-14">
          <div className="min-w-0">
            <div className="mb-8 flex flex-wrap justify-center gap-2 sm:gap-3">
              {categories.map((item) => {
                const selected = category === item;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleCategoryChange(item)}
                    aria-pressed={selected}
                    className={`rounded-full border px-4 py-2.5 font-sans text-sm font-semibold transition-all duration-300 sm:px-5 ${
                      selected
                        ? "border-primary bg-primary text-white shadow-[0_8px_20px_rgba(85,32,95,0.13)]"
                        : "border-primary/10 text-primary hover:border-primary/30 bg-white hover:bg-[#F6E5F7]"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <div className="border-primary/10 border-t">
              {filteredFAQs.map((item, index) => (
                <FAQItem
                  key={`${category}-${item.question}`}
                  item={item}
                  index={index}
                  open={activeIndex === index}
                  onToggle={() =>
                    setActiveIndex((current) =>
                      current === index ? null : index,
                    )
                  }
                />
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-5 rounded-[22px] bg-[linear-gradient(115deg,#55205F,#792D85)] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div>
                <span className="mb-2 inline-flex items-center gap-2 font-sans text-[10px] font-semibold tracking-[0.15em] text-white/65 uppercase">
                  <MessageCircle size={14} />
                  Still Curious?
                </span>

                <h3 className="font-heading text-[21px] font-semibold tracking-[-0.05em] sm:text-[24px]">
                  Let's clear things up.
                </h3>

                <p className="mt-1 font-sans text-[12px] text-white/70">
                  Our team is here to help with your questions.
                </p>
              </div>

              <Link
                href="/contact"
                className="group text-primary inline-flex w-fit shrink-0 items-center gap-3 rounded-full bg-white px-5 py-3.5 font-sans text-[12px] font-bold transition-all duration-300 hover:bg-[#F6E5F7]"
              >
                Get in Touch
                <ArrowUpRight
                  size={17}
                  className="transition-transform duration-300 group-hover:rotate-45"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes faq-orbit {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes faq-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }

        @keyframes faq-question-float {
          0%,
          100% {
            transform: translateY(0) rotate(-6deg);
          }
          50% {
            transform: translateY(-10px) rotate(6deg);
          }
        }

        .faq-orbit-slow {
          animation: faq-orbit 28s linear infinite;
        }

        .faq-orbit-reverse {
          animation: faq-orbit 20s linear infinite reverse;
        }

        .faq-question-float {
          animation: faq-question-float 5s ease-in-out infinite;
        }

        .faq-float-one {
          animation: faq-float 4s ease-in-out infinite;
        }

        .faq-float-two {
          animation: faq-float 5s ease-in-out infinite 0.5s;
        }

        .faq-float-three {
          animation: faq-float 4.5s ease-in-out infinite 1s;
        }

        @media (prefers-reduced-motion: reduce) {
          .faq-orbit-slow,
          .faq-orbit-reverse,
          .faq-question-float,
          .faq-float-one,
          .faq-float-two,
          .faq-float-three {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
