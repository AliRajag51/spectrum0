import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Frequently Asked Questions | Spectrum Biosciences",
  description:
    "Answers about Spectrum Biosciences research products, orders, shipping, and batch documentation.",
};

const groups = [
  {
    title: "Products & Research",
    items: [
      {
        question: "Are your products intended for human use?",
        answer:
          "No. Products in the Spectrum Biosciences research collection are intended for scientific and laboratory research only, not for human or veterinary use.",
      },
      {
        question: "How do I select a product strength?",
        answer:
          "Open a product page and choose from the available strength options. Pricing and availability update for the selected variant.",
      },
      {
        question: "Do you provide dosing or administration guidance?",
        answer:
          "No. We do not provide dosing, administration, or personal-use guidance. Researchers should follow their applicable laboratory procedures and product documentation.",
      },
      {
        question: "How should products be stored?",
        answer:
          "Storage requirements vary by compound and formulation. Follow the documentation for your specific product and your laboratory's established procedures.",
      },
    ],
  },
  {
    title: "Ordering & Shipping",
    items: [
      {
        question: "How do multi-bottle discounts work?",
        answer:
          "On eligible product pages, select a 2-, 5-, or 10-bottle pack. The applicable discount is shown before you add the pack to your cart.",
      },
      {
        question: "When will I see shipping charges?",
        answer:
          "Shipping details and any available delivery estimates are shown during checkout. Final charges depend on the shipping setup for your store.",
      },
      {
        question: "Can I update quantities in my cart?",
        answer:
          "Yes. Use the plus and minus controls in your cart to adjust quantities or remove an item before checkout.",
      },
      {
        question: "How do I ask about an existing order?",
        answer:
          "Visit our Contact page and select Order support. Include your order reference if one is available, but do not send payment card details.",
      },
    ],
  },
  {
    title: "Documentation & Support",
    items: [
      {
        question: "Where can I find a Certificate of Analysis?",
        answer:
          "Open the relevant product page and review its Laboratory Documentation section. Certificates are displayed when available for that product or batch.",
      },
      {
        question: "Why is a certificate not shown for every product?",
        answer:
          "Some products may not have a linked document on the website. Contact our team to ask about available batch documentation rather than assuming a result.",
      },
      {
        question: "How can I contact Spectrum Biosciences?",
        answer:
          "Use the Contact page to prepare an inquiry about products, documentation, or your order.",
      },
    ],
  },
];

export default function FAQsPage() {
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
            <span className="text-primary font-semibold">FAQs</span>
          </nav>
          <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            Helpful information
          </p>
          <h1 className="section-heading">
            Frequently Asked <span className="text-secondary">Questions.</span>
          </h1>
          <p className="text-md mt-3 max-w-xl text-[#817586]">
            Everything you need to know about our research collection, ordering,
            and product documentation.
          </p>
        </div>
      </header>

      <div className="px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-4 text-xs font-bold tracking-[0.14em] text-[#8C7C90] uppercase">
              On this page
            </p>

            <nav
              aria-label="FAQ sections"
              className="flex flex-wrap gap-2 lg:flex-col"
            >
              {groups.map((group, index) => (
                <a
                  key={group.title}
                  href={`#faq-${index}`}
                  className="text-primary hover:border-primary rounded-full border border-[#E8DCEA] px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-[#F6E5F7] lg:rounded-xl"
                >
                  {group.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-12">
            {groups.map((group, index) => (
              <section
                key={group.title}
                id={`faq-${index}`}
                aria-labelledby={`faq-heading-${index}`}
                className="scroll-mt-28"
              >
                <h2
                  id={`faq-heading-${index}`}
                  className="font-heading text-primary mb-5 text-2xl font-bold tracking-tight sm:text-[28px]"
                >
                  {group.title}
                </h2>

                <div className="divide-y divide-[#EEE6EF] border-y border-[#EEE6EF]">
                  {group.items.map((item) => (
                    <details key={item.question} className="group py-5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-[#29232D] marker:content-none sm:text-[15px] [&::-webkit-details-marker]:hidden">
                        {item.question}

                        <span className="text-primary grid size-8 shrink-0 place-items-center rounded-full bg-[#F6E5F7] transition-transform group-open:rotate-45">
                          <span className="text-xl leading-none">+</span>
                        </span>
                      </summary>

                      <p className="max-w-[720px] pt-3 pr-8 text-sm leading-[1.85] text-[#817586]">
                        {item.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            ))}

            <section className="flex flex-col justify-between gap-5 rounded-[22px] border border-[#EEE6EF] p-6 sm:flex-row sm:items-center sm:p-8">
              <div>
                <p className="text-secondary text-[11px] font-bold tracking-[0.14em] uppercase">
                  Need more help?
                </p>

                <h2 className="font-heading text-primary mt-2 text-[23px] font-bold tracking-tight">
                  Still have a question?
                </h2>

                <p className="mt-2 text-sm text-[#817586]">
                  Send us your inquiry and we'll point you in the right
                  direction.
                </p>
              </div>

              <Link
                href="/contact"
                className="group bg-primary inline-flex shrink-0 items-center justify-center gap-3 rounded-full px-6 py-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#35143E]"
              >
                Contact Us
                <ArrowUpRight
                  size={16}
                  className="transition-transform group-hover:rotate-45"
                />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
