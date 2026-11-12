import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FlaskConical,
  FileCheck2,
  Microscope,
  ShieldCheck,
} from "lucide-react";

export const metadata = {
  title: "About Us | Spectrum Biosciences",
  description:
    "Discover Spectrum Biosciences and our approach to research products, product information, and laboratory documentation.",
};

const images = {
  bpc: "/products/BPC-157.webp",
  ghk: "/products/ghk-cu.webp",
  tesamorelin: "/products/tesamorelin.webp",
  blend: "/products/glow-blend.webp",
  tb: "/products/tb-500.webp",
};

const principles = [
  {
    number: "01",
    icon: Microscope,
    title: "Research-Focused",
    description:
      "Our collection is organized around compounds intended for scientific investigation and analytical laboratory applications.",
  },
  {
    number: "02",
    icon: FileCheck2,
    title: "Information Matters",
    description:
      "We believe researchers should be able to review clear product specifications and available batch-specific documentation.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Responsible Research",
    description:
      "Our products are presented for laboratory research purposes, with clear distinctions between research materials and medical products.",
  },
];

export default function AboutUsPage() {
  return (
    <main className="min-h-screen">
      <header className="relative isolate min-h-110 overflow-hidden border-b border-[#EEE6EF] px-4 py-10 sm:min-h-80 sm:px-6 md:min-h-30 md:py-10 lg:min-h-90 lg:px-8">
        {/* BACKGROUND IMAGES */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          {/* MOBILE ONLY */}
          <Image
            src="/assets/about-banner-mobile.png"
            alt=""
            fill
            priority
            sizes="(max-width: 639px) 100vw, 1px"
            className="object-cover object-center sm:hidden"
          />

          {/* TABLET + DESKTOP */}
          <div
            className="absolute inset-0 hidden bg-[#F8E9FA] bg-no-repeat sm:block"
            style={{
              backgroundImage: "url('/assets/about-banner.png')",
              backgroundSize: "100% auto",
              backgroundPosition: "center center",
            }}
          />
        </div>

        {/* SOFT WHITE OVERLAY */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-white/35 via-white/10 to-transparent" />

        {/* HEADER CONTENT */}
        <div className="relative z-10 mx-auto max-w-7xl">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex items-center gap-2 text-xs text-[#95879A]"
          >
            <Link href="/" className="hover:text-primary">
              Home
            </Link>

            <ChevronRight size={13} />

            <span className="text-primary font-semibold">About</span>
          </nav>

          <p className="text-gold mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            Our Story
          </p>

          <h1 className="section-heading">
            Driven by <span className="text-gold">Quality.</span>
          </h1>

          <p className="text-md mt-3 text-gray-800 md:max-w-sm lg:max-w-xl">
            Learn about our mission, values, and commitment to delivering
            quality products through transparency, research, and innovation.
          </p>
        </div>
      </header>

      <section className="px-4 py-12 sm:px-6 md:py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <h2 className="section-heading">
            Driven by <span className="text-gold">Curiosity.</span> Defined by
            Research.
          </h2>

          <div className="bg-gold mt-6 h-[3px] w-16 rounded-full" />

          <p className="font-heading mt-8 text-[22px] leading-[1.4] font-medium tracking-[-0.04em] text-[#49374E] sm:text-[28px]">
            Every meaningful discovery starts with a question worth exploring.
          </p>

          <div className="text-md mt-5 space-y-4 text-[#817586]">
            <p>
              At Spectrum Biosciences, we believe scientific exploration
              deserves a clear and thoughtful approach. Our collection brings
              together research peptides, specialized blends, and laboratory
              solutions in one accessible place.
            </p>

            <p>
              We focus on helping researchers explore available compounds,
              compare product strengths, and review relevant information with
              confidence and clarity.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#FCF9FC] px-5 py-12 sm:px-8 md:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-11 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="section-heading">
                What Guides Us<span className="text-gold">.</span>
              </h2>
            </div>
            <p className="text-md max-w-[370px] text-[#817586]">
              A focused approach to how research products are presented,
              understood, and explored.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {principles.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.number}
                  className="group hover:border-primary/20 relative flex min-h-[285px] flex-col overflow-hidden rounded-[22px] border border-[#EBE0ED] p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(85,32,95,0.06)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-primary flex size-12 items-center justify-center rounded-[14px] bg-[#F6E5F7]">
                      <Icon size={23} strokeWidth={1.6} />
                    </span>
                  </div>

                  <div className="mt-auto pt-10">
                    <h3 className="font-heading text-primary text-[23px] font-bold tracking-[-0.04em]">
                      {item.title}
                    </h3>
                    <p className="text-md mt-3 text-[#817586]">
                      {item.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="overflow-hidden px-5 py-12 sm:px-8 md:py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="relative mx-auto w-full max-w-[540px] pt-8 pr-8 pb-14 sm:pt-12 sm:pr-16 sm:pb-20">
            <div className="relative aspect-square w-full overflow-hidden rounded-[22px] bg-[#F3E3F6]">
              <Image
                src="/assets/about-sec.png"
                alt="TB-500 research product"
                fill
                sizes="(max-width: 1024px) 90vw, 480px"
                className="object-cover transition-transform duration-700 hover:scale-105"
              />
            </div>

            <div className="absolute right-0 bottom-0 z-10 w-[43%]">
              <div className="relative aspect-square overflow-hidden rounded-[20px] border-[5px] border-white bg-[#EBD2EF] shadow-[0_20px_45px_rgba(85,32,95,0.12)] sm:border-[7px]">
                <Image
                  src={images.blend}
                  alt="GLOW research blend"
                  fill
                  sizes="(max-width: 1024px) 40vw, 220px"
                  className="object-cover transition-transform duration-700 hover:scale-110"
                />
              </div>
            </div>

            <div className="bg-primary absolute top-0 left-0 z-20 flex size-[94px] items-center justify-center rounded-full border-[5px] border-white text-white shadow-[0_10px_30px_rgba(85,32,95,0.15)] sm:size-[125px]">
              <svg
                viewBox="0 0 120 120"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full animate-[spin_18s_linear_infinite] motion-reduce:animate-none"
              >
                <defs>
                  <path
                    id="spectrum-rotating-badge"
                    d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0"
                  />
                </defs>
                <text
                  fill="white"
                  fontSize="10.5"
                  fontWeight="600"
                  letterSpacing="2.5"
                >
                  <textPath href="#spectrum-rotating-badge">
                    SPECTRUM • RESEARCH • DISCOVERY •
                  </textPath>
                </text>
              </svg>
              <FlaskConical
                size={29}
                strokeWidth={1.4}
                className="relative z-10 sm:size-[35px]"
              />
            </div>

            <div className="/90 absolute bottom-[17%] left-5 z-10 hidden rounded-xl border border-white/70 px-4 py-3 shadow-sm backdrop-blur-md sm:block">
              <span className="text-gold text-[10px] font-bold tracking-[0.12em] uppercase">
                Spectrum Biosciences
              </span>
              <p className="font-heading text-primary mt-1 text-[16px] font-semibold">
                Research & Discovery
              </p>
            </div>
          </div>

          <div>
            <h2 className="section-heading">
              More Than
              <br />
              Just a <span className="text-gold">Product.</span>
            </h2>

            <p className="text-md mt-6 max-w-[470px] text-[#817586]">
              Understanding a research compound involves more than its name.
              Strength, formulation, intended laboratory context, and available
              documentation all play a role in making an informed purchasing
              decision.
            </p>

            <p className="text-md mt-4 max-w-[470px] text-[#817586]">
              That's why we prioritize an organized collection with clear
              product information and a dedicated place to explore
              batch-specific analytical records where available.
            </p>

            <Link
              href="/coa"
              className="group border-primary text-primary hover:border-secondary hover:text-gold mt-8 inline-flex items-center gap-3 border-b pb-2 text-[13px] font-bold transition-colors"
            >
              Explore COA Documentation
              <ArrowUpRight
                size={17}
                className="transition-transform duration-300 group-hover:rotate-45"
              />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
