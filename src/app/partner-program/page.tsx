"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  FileCheck2,
  Gift,
  Handshake,
  Link2,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct, StorefrontVariant } from "@/lib/storefront";

const usd = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

const tiers = [
  {
    name: "Associate",
    rate: 0.1,
    minimum: 0,
    range: "Under $2,500 / month",
    perks: [
      "Tracking link & dashboard",
      "Partner creative assets",
      "Available CoA access",
    ],
  },
  {
    name: "Partner",
    rate: 0.125,
    minimum: 2500,
    range: "$2,500–$9,999 / month",
    perks: [
      "Everything in Associate",
      "Audience discount code*",
      "Priority partner support",
    ],
  },
  {
    name: "Senior",
    rate: 0.15,
    minimum: 10000,
    range: "$10,000–$49,999 / month",
    perks: [
      "Everything in Partner",
      "Dedicated account contact",
      "Early product announcements",
    ],
  },
  {
    name: "Laboratory",
    rate: 0.18,
    minimum: 50000,
    range: "$50,000+ / month",
    perks: [
      "Everything in Senior",
      "Co-branded materials*",
      "Custom volume discussions",
    ],
  },
];

const steps = [
  {
    number: "01",
    title: "Apply",
    description:
      "Introduce your organization, research community, or publication and tell us how you plan to share Spectrum.",
  },
  {
    number: "02",
    title: "Review",
    description:
      "Our team reviews your application and confirms program eligibility and the terms available to you.",
  },
  {
    number: "03",
    title: "Share",
    description:
      "Use approved product imagery, your referral link, and available batch documentation in your content.",
  },
  {
    number: "04",
    title: "Earn",
    description:
      "See attributed orders and estimated commission in your partner reporting, once your account is active.",
  },
];

const benefits = [
  {
    icon: BarChart3,
    title: "Clear performance reporting",
    description:
      "Review referral activity, order totals, estimated earnings, and payout history in one place.",
  },
  {
    icon: Link2,
    title: "Your own referral link",
    description:
      "Share one identifiable link with your audience and see which eligible orders it brings in.",
  },
  {
    icon: FileCheck2,
    title: "Research documentation",
    description:
      "Reference published, batch-specific Certificates of Analysis when available.",
  },
  {
    icon: Gift,
    title: "Ready-to-use creative",
    description:
      "Use approved product images and brand assets instead of building every campaign from scratch.",
  },
  {
    icon: Handshake,
    title: "Partner support",
    description:
      "Get a direct channel for questions about eligibility, creative guidelines, and reporting.",
  },
  {
    icon: ShieldCheck,
    title: "Responsible communication",
    description:
      "Keep messaging aligned with research-use restrictions and avoid unsupported medical claims.",
  },
];

const suggestedSlugs = ["bpc-157", "tesamorelin", "selank", "tb-500"];

type PricedItem = {
  product: StorefrontProduct;
  variant: StorefrontVariant & { price: number };
};

/* Only strengths with a known price can go into the estimate. */
function featuredItems(products: StorefrontProduct[]): PricedItem[] {
  return suggestedSlugs.flatMap((slug) => {
    const product = products.find((item) => item.slug === slug);
    if (!product) return [];
    const variant =
      product.variants[product.defaultVariant] ?? product.variants[0];
    if (!variant || variant.price == null) return [];
    return [{ product, variant: { ...variant, price: variant.price } }];
  });
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
        {eyebrow}
      </p>
      <h2 className="section-heading">{title}</h2>
      {description && (
        <p className="text-md mt-3 text-[#756779]">{description}</p>
      )}
    </div>
  );
}

function EarningsEstimator() {
  const products = useProducts();
  const featured = useMemo(() => featuredItems(products), [products]);
  const [selected, setSelected] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      featured.map(({ product }, i) => [product.id, i === 0 ? 1 : 0]),
    ),
  );
  const [orders, setOrders] = useState(24);
  const orderValue = useMemo(
    () =>
      featured.reduce(
        (sum, { product, variant }) =>
          sum + variant.price * (selected[product.id] || 0),
        0,
      ),
    [featured, selected],
  );
  const monthlyRevenue = orderValue * orders;
  const tier =
    [...tiers].reverse().find((item) => monthlyRevenue >= item.minimum) ||
    tiers[0];
  const commission = monthlyRevenue * tier.rate;
  const itemsCount = Object.values(selected).reduce((sum, qty) => sum + qty, 0);

  const changeQuantity = (id: string, delta: number) => {
    setSelected((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(10, (current[id] || 0) + delta)),
    }));
  };

  return (
    <section
      id="earnings"
      className="scroll-mt-24 bg-[#FCF9FD] px-5 py-12 sm:px-8 md:py-16"
    >
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Earnings estimator"
          title="See what referrals could earn."
          description="Build a sample order using live catalogue prices, then adjust monthly referrals. The calculator uses proposed commission tiers and is an illustration—not an earnings guarantee."
        />
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-8">
          <div className="rounded-[24px] border border-[#E9DDEA] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE6EF] pb-5">
              <div>
                <h3 className="font-heading text-primary text-2xl font-bold">
                  Your sample order
                </h3>
                <p className="mt-1 text-sm text-[#857789]">
                  Choose products and quantities per referred order.
                </p>
              </div>
              <span className="text-primary rounded-full bg-[#F6E5F7] px-4 py-2 text-sm font-semibold">
                {itemsCount} items
              </span>
            </div>
            <div className="divide-y divide-[#EEE6EF]">
              {featured.map(({ product, variant }) => {
                const quantity = selected[product.id] || 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 py-4 sm:gap-5"
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[14px] bg-[#F8EFF9] sm:size-20">
                      {product.image && (
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-primary text-base font-bold sm:text-lg">
                        {product.name}
                      </p>
                      <p className="mt-1 text-sm text-[#8B7B8E]">
                        {variant.label} · {usd(variant.price)}
                      </p>
                    </div>
                    <div className="flex h-10 shrink-0 items-center rounded-full border border-[#E8DCEA] bg-white p-1">
                      <button
                        type="button"
                        onClick={() => changeQuantity(product.id, -1)}
                        disabled={quantity === 0}
                        aria-label={`Remove one ${product.name}`}
                        className="text-primary grid size-8 place-items-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="text-primary w-7 text-center text-base font-semibold">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(product.id, 1)}
                        disabled={quantity === 10}
                        aria-label={`Add one ${product.name}`}
                        className="text-primary grid size-8 place-items-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#EEE6EF] pt-5">
              <span className="text-base font-semibold text-[#625468]">
                Sample order value
              </span>
              <strong className="font-heading text-primary text-3xl font-bold tracking-tight">
                {usd(orderValue)}
              </strong>
            </div>
          </div>
          <aside className="rounded-[24px] border border-[#E9DDEA] bg-white p-5 sm:p-7 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-3">
              <p className="text-primary text-base font-semibold">
                Referred orders / month
              </p>
              <span className="font-heading text-primary text-3xl font-bold">
                {orders}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="150"
              value={orders}
              onChange={(event) => setOrders(Number(event.target.value))}
              aria-label="Referred orders per month"
              className="mt-5 w-full cursor-pointer accent-[#55205F]"
            />
            <div className="mt-2 flex justify-between text-sm text-[#918394]">
              <span>1 order</span>
              <span>150 orders</span>
            </div>
            <div className="mt-7 rounded-[20px] bg-[linear-gradient(135deg,#35143E,#55205F_65%,#803685)] p-6 text-white">
              <p className="text-sm font-semibold text-white/80">
                Estimated monthly commission
              </p>
              <p
                aria-live="polite"
                className="font-heading mt-3 text-5xl font-bold tracking-[-0.06em] sm:text-[54px]"
              >
                {usd(commission)}
              </p>
              <p className="mt-3 text-sm text-white/80">
                {tier.rate * 100}% of {usd(monthlyRevenue)} referred sales
              </p>
            </div>
            <div className="mt-6 space-y-4 text-base">
              <div className="flex justify-between gap-4">
                <span className="text-[#827385]">Illustrative tier</span>
                <strong className="text-primary">{tier.name}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#827385]">Commission rate</span>
                <strong className="text-primary">{tier.rate * 100}%</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#827385]">Annual estimate</span>
                <strong className="text-primary">{usd(commission * 12)}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#827385]">Average per order</span>
                <strong className="text-primary">
                  {usd(orders ? commission / orders : 0)}
                </strong>
              </div>
            </div>
            <p className="mt-6 border-t border-[#EEE6EF] pt-4 text-sm leading-6 text-[#877889]">
              Illustrative gross sales. Taxes, returns, exclusions, eligibility,
              and actual program terms can change payable commissions.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function PartnerProgramPage() {
  const [openQuestion, setOpenQuestion] = useState(0);
  const questions = [
    {
      question: "Who can apply?",
      answer:
        "Creators, publishers, research communities, and organizations whose activities align with Spectrum's research-use-only positioning may express interest. Participation is subject to approval.",
    },
    {
      question: "How are commissions calculated?",
      answer:
        "The estimator uses the example tier rate against an illustrative monthly referred revenue total. Actual payable commission requires an approved agreement, eligible sales, and verified order attribution.",
    },
    {
      question: "Can I make medical or dosing claims?",
      answer:
        "No. Partner content must not promote human or veterinary administration, dosing, treatment outcomes, or unsupported medical claims. Products are presented for laboratory research only.",
    },
    {
      question: "Where do I get my referral link?",
      answer:
        "Tracking links, codes, reporting, and payouts require an operational partner system. They are not available through this demonstration page until your program is launched.",
    },
  ];

  return (
    <main className="min-h-screen">
      <section className="overflow-hidden border-b border-[#EEE6EF] px-4 py-6 md:py-12 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="text-secondary mb-3 text-[11px] font-bold tracking-[0.16em] uppercase">
              Spectrum Partner Program
            </p>
            <h1 className="section-heading">
              Recommend research.{" "}
              <span className="text-secondary">Grow together.</span>
            </h1>
            <p className="text-md mt-6 max-w-xl text-[#6E6173]">
              Connect your audience with Spectrum's research catalogue. Explore
              proposed commission tiers, model potential referrals, and learn
              how a responsible research partnership could work.
            </p>
            <div className="mt-8 flex w-full items-center gap-2 sm:gap-4">
              <Link
                href="/contact"
                className="group bg-primary inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#35143E] sm:h-13 sm:flex-none sm:gap-3 sm:px-7 sm:text-base"
              >
                Apply / Enquire
                <ArrowUpRight
                  size={16}
                  className="shrink-0 transition-transform group-hover:rotate-45 sm:size-[19px]"
                />
              </Link>

              <a
                href="#earnings"
                className="text-primary inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#E0CEE4] px-2 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-[#F8EFF9] sm:h-13 sm:flex-none sm:gap-2 sm:px-6 sm:text-base"
              >
                Estimate Earnings
                <ArrowRight size={16} className="shrink-0 sm:size-[18px]" />
              </a>
            </div>
            <p className="mt-5 text-sm leading-6 text-[#928494]">
              Program details below are proposed examples and require business
              approval before launch.
            </p>
          </div>
          <div className="relative min-h-[350px] overflow-hidden rounded-[26px] bg-[#F6E8F8] sm:min-h-[460px]">
            <Image
              src="/assets/partner.png"
              alt="Spectrum BPC-157 research product"
              fill
              priority
              sizes="(max-width:1024px) 100vw, 45vw"
              className="object-cover object-right"
            />
            <div className="absolute right-5 bottom-5 left-5 rounded-[18px] border border-white/70 bg-white/30 p-5 backdrop-blur-md sm:right-7 sm:bottom-7 sm:left-7">
              <p className="text-secondary text-sm font-semibold">
                Built for responsible partnerships
              </p>
              <p className="font-heading text-primary mt-2 text-2xl font-bold sm:text-3xl">
                Research-first. Clear by design.
              </p>
            </div>
          </div>
        </div>
      </section>

      <EarningsEstimator />

      <section className="px-5 py-12 sm:px-8 md:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="A clear path to growth"
            title="Commission tiers."
            description="These example tiers use trailing 30-day referred revenue. Final rates, thresholds, and benefits must be approved before the partner program launches."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {tiers.map((tier, index) => (
              <article
                key={tier.name}
                className={`flex h-full flex-col rounded-[23px] border p-6 sm:p-7 ${index === 1 ? "border-primary bg-[#FCF7FD] shadow-[0_16px_40px_rgba(85,32,95,0.07)]" : "border-[#E9DDEA] bg-white"}`}
              >
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <h3 className="font-heading text-primary text-2xl font-bold">
                    {tier.name}
                  </h3>
                  {index === 1 && (
                    <span className="bg-primary rounded-full px-3 py-1 text-xs font-semibold text-white">
                      Popular tier
                    </span>
                  )}
                </div>
                <p className="font-heading text-primary mt-7 text-5xl font-bold tracking-tight">
                  {tier.rate * 100}%
                </p>
                <p className="mt-3 min-h-12 text-base leading-6 text-[#76697B]">
                  {tier.range}
                </p>
                <div className="mt-6 flex-1 space-y-4 border-t border-[#E9DDEA] pt-6">
                  {tier.perks.map((perk) => (
                    <div key={perk} className="flex items-start gap-3">
                      <Check
                        size={19}
                        className="text-secondary mt-0.5 shrink-0"
                      />
                      <p className="text-base leading-6 text-[#55485A]">
                        {perk}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-[#8D8091]">
            *Availability of codes, managed accounts, and co-branded material
            depends on the final partner agreement.
          </p>
        </div>
      </section>

      <section className="bg-[#FCF9FD] px-5 py-12 sm:px-8 md:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Simple process"
            title="Four steps to partnership."
            description="A straightforward path from first contact to sharing approved research information."
          />
          <div className="mt-11 grid grid-cols-2 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className="border-t-2 border-[#E5D2E9] pt-6"
              >
                <h3 className="font-heading text-primary text-2xl font-semibold">
                  {step.title}
                </h3>
                <p className="mt-3 text-base text-[#76697B]">
                  {step.description}
                </p>
                {index < 3 && (
                  <ArrowRight
                    size={20}
                    className="text-primary/30 mt-6 hidden lg:block"
                  />
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 md:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Partner benefits"
            title="Everything in one place."
            description="The tools and support proposed for making product information easier to share and partner activity easier to understand."
          />
          <div className="mt-10 grid gap-x-9 gap-y-0 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article key={title} className="border-t border-[#E9DDEA] py-8">
                <span className="text-primary flex size-12 items-center justify-center rounded-[14px] bg-[#F6E5F7]">
                  <Icon size={23} strokeWidth={1.7} />
                </span>
                <h3 className="font-heading text-primary mt-5 text-2xl font-bold">
                  {title}
                </h3>
                <p className="mt-3 text-base leading-7 text-[#77697B]">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
