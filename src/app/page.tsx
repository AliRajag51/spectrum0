import Bestsellers from "@/components/Bestsellers";
import CTASection from "@/components/CTASection";
import Faqs from "@/components/Faqs";
import ResearchStandards from "@/components/ResearchStandards";
import HowItWorks from "@/components/HowItWorks";
import LabVerification from "@/components/LabVerification";
import ProductGrid from "@/components/ProductGrid";
import USShippingCoverage from "@/components/shipping/USShippingCoverage";
import WhyChooseUs from "@/components/WhyChooseUs";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section
        aria-labelledby="hero-heading"
        className="relative h-[calc(100svh-110px)] w-full overflow-hidden bg-[#EAF7FA] sm:h-[calc(100svh-115px)] lg:h-[calc(100svh-110px)]"
      >
        <div className="absolute inset-0">
          {/* MOBILE + TABLET */}
          <Image
            src="/assets/hero-mobile.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 1px"
            className="object-cover object-bottom lg:hidden"
          />

          {/* DESKTOP */}
          <Image
            src="/assets/hero.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 100vw, 1px"
            className="hidden object-cover object-center lg:block"
          />
        </div>

        <div className="relative z-10 mx-auto h-full w-full max-w-7xl px-4">
          <div className="flex h-full w-full flex-col items-center justify-start pt-12 text-center sm:pt-10 md:pt-12 lg:items-start lg:justify-center lg:py-0 lg:text-left">
            <div className="relative z-30 w-full max-w-[560px] lg:max-w-[620px]">
              {/* SOFT WHITE GLOW BEHIND CONTENT ONLY */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-5 -inset-y-6 -z-10 sm:-inset-x-10 lg:-inset-x-14"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 75%)",
                }}
              />

              <h1
                id="hero-heading"
                data-hero-heading
                className="text-primary max-w-[620px] text-[clamp(2.1rem,8.5vw,2.8rem)] leading-[1.05] font-bold tracking-[-0.045em] sm:text-[clamp(2.8rem,5vw,4rem)] lg:text-[clamp(3.6rem,4.5vw,5rem)]"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                Research-Grade
                <br />
                Peptides for
                <br />
                <span className="text-gold">Scientific Discovery</span>
              </h1>

              {/* WELCOME LABEL */}
              <p className="text-primary-light mt-5 font-sans text-xs font-bold tracking-[0.18em] uppercase">
                Welcome to Spectrum
              </p>

              {/* SECONDARY HEADING */}
              <h2 className="font-heading text-primary mt-2 text-2xl leading-[1.15] font-bold tracking-[-0.04em] sm:text-3xl lg:text-4xl">
                Where Science
                <br />
                Meets Discovery
              </h2>

              {/* DESCRIPTION */}
              <p
                data-hero-description
                className="mx-auto mt-4 max-w-120 font-sans text-sm leading-[1.7] sm:mt-6 sm:text-[16px] lg:mx-0"
              >
                Explore a new standard in research peptides, where scientific
                curiosity meets a commitment to quality and precision.
              </p>

              {/* BUTTON */}
              <div
                data-hero-buttons
                className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:mt-8 lg:justify-start"
              >
                <Link href="/shop" className="btn-gradient">
                  Explore Collection
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ResearchStandards />

      <ProductGrid />
      <WhyChooseUs />
      <LabVerification />
      <HowItWorks />
      <Bestsellers />

      <section className="px-4 py-12 sm:px-6 sm:py-0 lg:px-10">
        <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl bg-[#F2E2F5]">
          <div className="relative w-full overflow-hidden">
            <Image
              src="/assets/promo-banner.png"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 1280px, 100vw"
              className="hidden object-cover object-center lg:block"
            />

            <Image
              src="/assets/promo-banner-mobile.png"
              alt=""
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 1280px"
              className="object-cover object-bottom lg:hidden"
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#F9ECFC]/45 via-transparent to-transparent lg:hidden" />

            <div className="relative z-10 flex w-full flex-col items-start px-5 pt-8 pb-70 sm:px-10 sm:pt-12 sm:pb-[440px] md:px-12 md:pt-14 md:pb-110 lg:min-h-[420px] lg:justify-center lg:px-16 lg:py-12">
              <div className="w-full max-w-[420px]">
                <span className="text-primary/70 mb-3 inline-block font-sans text-[10px] font-bold tracking-[0.16em] uppercase sm:text-[11px]">
                  Spectrum Biosciences
                </span>

                <h2 className="section-heading">
                  Small Vials.
                  <br />
                  Big <span className="text-gold">Discoveries.</span>
                </h2>
                <div
                  aria-hidden="true"
                  className="my-2 h-[3px] w-28 rounded-full bg-linear-to-r from-[#A87516] via-[#FFE49A] to-[#E4A60C] shadow-[0_0_10px_rgba(228,166,12,0.2)]"
                />
                <p className="text-md mt-2 max-w-[340px] font-sans leading-[1.7] text-[#4E3D52]">
                  Explore research-focused compounds from Spectrum Biosciences,
                  created for laboratory research.
                </p>

                <Link href="/shop" className="btn-gradient mt-3">
                  Explore Collection
                  <ArrowUpRight
                    size={17}
                    className="transition-transform duration-300 group-hover:rotate-45"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Faqs />
      <USShippingCoverage />
      <CTASection />
    </main>
  );
}
