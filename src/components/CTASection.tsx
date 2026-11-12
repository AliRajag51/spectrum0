"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight, ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);
const featuredProducts = [
  { id: 1, image: "/assets/cta-1.png", name: "cta 1" },
  { id: 2, image: "/assets/cta-2.png", name: "cta 2" },
  { id: 3, image: "/assets/cta-3.png", name: "cta 3" },
  { id: 4, image: "/assets/cta-4.png", name: "cta 4" },
  { id: 5, image: "/assets/cta-5.png", name: "cta 5" },
];

function ProductShowcase() {
  const showcaseRef = useRef<HTMLDivElement>(null);

  const positions = [
    "left-[6%] top-[28%] z-10 w-[29%] -rotate-[20deg] sm:left-[8%] sm:top-[25%] lg:left-[12%] lg:w-[22%]",
    "left-[19%] top-[13%] z-20 w-[32%] -rotate-[10deg] sm:left-[22%] sm:top-[12%] lg:left-[24%] lg:w-[25%]",
    "left-1/2 top-0 z-30 w-[38%] -translate-x-1/2 sm:w-[35%] lg:w-[29%]",
    "right-[19%] top-[13%] z-20 w-[32%] rotate-[10deg] sm:right-[22%] sm:top-[12%] lg:right-[24%] lg:w-[25%]",
    "right-[6%] top-[28%] z-10 w-[29%] rotate-[20deg] sm:right-[8%] sm:top-[25%] lg:right-[12%] lg:w-[22%]",
  ];

  useEffect(() => {
    const container = showcaseRef.current;
    if (!container) return;

    const cards = container.querySelectorAll(".cta-product");

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        {
          y: 160,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 1.2,
          stagger: {
            each: 0.18,
            from: "center",
          },
          ease: "back.out(1.3)",
          scrollTrigger: {
            trigger: container,
            start: "top 78%",
            once: true,
          },
        },
      );
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={showcaseRef}
      className="relative mx-auto mt-10 h-[250px] w-full max-w-[1100px] overflow-hidden sm:mt-12 sm:h-[350px] md:h-[420px] lg:mt-14 lg:h-[470px]"
    >
      {featuredProducts.slice(0, 5).map((product, index) => (
        <div
          key={product.id}
          className={`cta-product group absolute aspect-[3/4] ${positions[index]}`}
        >
          <div className="relative h-full w-full transition-transform duration-500 group-hover:-translate-y-2">
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 40vw, (max-width: 1024px) 35vw, 320px"
              className="object-contain drop-shadow-[0_20px_18px_rgba(45,15,55,0.28)] transition-all duration-700 ease-out group-hover:scale-105 group-hover:drop-shadow-[0_30px_25px_rgba(45,15,55,0.38)]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CTASection() {
  return (
    <section
      aria-labelledby="cta-title"
      className="relative w-full overflow-hidden bg-[#f6e8ff] px-4 pt-12 sm:px-6 md:pt-16 lg:px-10"
    >
      <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[#F6E5F7]/60 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="relative z-40 mx-auto max-w-[720px] text-center">
          <h2 id="cta-title" className="section-heading">
            Your Next Discovery.
            <br />
            <span className="text-gold">Starts Here.</span>
          </h2>

          <p className="text-md mx-auto mt-3 max-w-[480px] font-sans text-[#625765]">
            Explore research-focused compounds from Spectrum Biosciences and
            discover the products that fit your laboratory needs.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/shop" className="btn-gradient">
              Explore Collection
              <ArrowUpRight
                size={17}
                className="transition-transform duration-300 group-hover:rotate-45"
              />
            </Link>

            <Link
              href="/contact"
              className="group border-primary/15 text-primary hover:border-primary/40 inline-flex items-center gap-3 rounded-full border bg-white/70 px-6 py-3.5 font-sans text-[12px] font-semibold transition-all duration-300 hover:bg-white sm:text-[13px]"
            >
              Get in Touch
              <ArrowRight
                size={17}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>

        <ProductShowcase />
      </div>
    </section>
  );
}
