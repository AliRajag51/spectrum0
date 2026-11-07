"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Dna,
  FlaskConical,
} from "lucide-react";

const heroProducts = [
  { id: 1, name: "BPC-157", image: "/assets/cta-1.png" },
  { id: 2, name: "BPC + KPV", image: "/assets/cta-2.png" },
  { id: 3, name: "Cagrilintide", image: "/assets/cta-3.png" },
  { id: 4, name: "5-Amino 1-MQ", image: "/assets/cta-4.png" },
  { id: 5, name: "5-Amino 1-MQ", image: "/assets/cta-5.png" },
];

const positions = [
  { x: "0%", y: "0%", scale: 1, opacity: 1, zIndex: 5 },
  { x: "55%", y: "4%", scale: 0.76, opacity: 0.85, zIndex: 3 },
  { x: "30%", y: "-15%", scale: 0.55, opacity: 0.45, zIndex: 1 },
  { x: "-30%", y: "-15%", scale: 0.55, opacity: 0.45, zIndex: 1 },
  { x: "-55%", y: "4%", scale: 0.76, opacity: 0.85, zIndex: 3 },
];

export default function ShopHero() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = () =>
    setActive((current) => (current + 1) % heroProducts.length);
  const previous = () =>
    setActive(
      (current) => (current - 1 + heroProducts.length) % heroProducts.length,
    );

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(next, 3500);
    return () => clearInterval(interval);
  }, [paused]);

  return (
    <section className="px-4 pt-6 sm:px-6 md:pt-12 lg:px-10">
      <div className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-[24px] bg-[linear-gradient(115deg,#FCF8FD_0%,#F5E8F8_45%,#E7CCEE_100%)] sm:rounded-[30px]">
        <FlaskConical
          aria-hidden="true"
          strokeWidth={0.6}
          className="text-primary/10 pointer-events-none absolute top-4 right-4 size-[160px] rotate-[-25deg] sm:size-[240px] lg:-top-8 lg:size-[320px]"
        />

        <div className="relative z-10 grid items-center lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative z-20 flex flex-col justify-center px-5 pt-10 pb-4 sm:px-8 lg:py-12 lg:pl-12">
            <p className="text-secondary mb-3 text-xs font-bold tracking-[0.15em] uppercase">
              Spectrum Biosciences
            </p>

            <h1 className="section-heading">
              Explore Our
              <br />
              <span className="text-secondary">Collection.</span>
            </h1>

            <p className="mt-4 max-w-[420px] text-sm leading-7 text-[#76677B] sm:text-base">
              Discover our research collection, explore available strengths, and
              find compounds for your laboratory requirements.
            </p>
          </div>

          <div className="relative flex h-[300px] items-center justify-center overflow-hidden sm:h-[360px] lg:h-[420px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0.2)_45%,transparent_72%)]" />

            <div className="pointer-events-none absolute top-[8%] left-1/2 size-[260px] -translate-x-1/2 rounded-full border border-white/40 sm:size-[320px] lg:size-[370px]" />

            <div className="pointer-events-none absolute top-[15%] left-1/2 size-[210px] -translate-x-1/2 rounded-full border border-white/30 sm:size-[260px] lg:size-[300px]" />

            <div className="absolute bottom-[15%] left-1/2 h-9 w-[65%] -translate-x-1/2 rounded-[50%] bg-[#55205F]/15 blur-[22px]" />

            <div className="absolute bottom-[17%] left-1/2 h-[45px] w-[65%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(180deg,#FDF8FF_0%,#DAB8E4_100%)] shadow-[0_18px_30px_rgba(85,32,95,0.15)]">
              <div className="absolute inset-x-0 top-0 h-5 rounded-[50%] border border-white bg-[linear-gradient(180deg,#FFFFFF_0%,#E9D4EE_100%)]" />
            </div>

            <div className="relative z-10 mb-5 size-[260px] sm:size-[310px] lg:size-[340px]">
              {heroProducts.map((product, index) => {
                const position =
                  (index - active + heroProducts.length) % heroProducts.length;
                const current = positions[position];

                return (
                  <motion.div
                    key={product.id}
                    initial={false}
                    animate={current}
                    transition={{
                      duration: 1,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ zIndex: current.zIndex }}
                  >
                    <div className="relative h-[230px] w-[175px] sm:h-[280px] sm:w-[215px] lg:h-[310px] lg:w-[240px]">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        priority={index === 0}
                        sizes="(max-width: 640px) 175px, (max-width: 1024px) 215px, 240px"
                        className="object-contain drop-shadow-[0_20px_18px_rgba(55,20,65,0.18)]"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
