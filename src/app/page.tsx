import Bestsellers from "@/components/Bestsellers";
import CTASection from "@/components/CTASection";
import Faqs from "@/components/Faqs";
import Hero from "@/components/Hero";
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
      <Hero />
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
                  Big <span className="text-secondary">Discoveries.</span>
                </h2>

                <p className="text-md mt-4 max-w-[340px] font-sans leading-[1.7] text-[#4E3D52]">
                  Explore research-focused compounds from Spectrum Biosciences,
                  created for laboratory research.
                </p>

                <Link
                  href="/shop"
                  className="group bg-primary hover:bg-primary-dark mt-6 inline-flex items-center gap-3 rounded-full px-5 py-3 font-sans text-sm font-semibold text-white transition-all duration-300 sm:px-6 sm:py-3.5"
                >
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
