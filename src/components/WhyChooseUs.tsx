"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Microscope,
  Truck,
  Droplets,
  Headset,
  FlaskConical,
  NotepadText,
} from "lucide-react";
import AOS from "aos";
import "aos/dist/aos.css";
import type { LucideIcon } from "lucide-react";

type Feature = {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    number: "01",
    icon: BadgeCheck,
    title: "Lab-Tested Every Batch",
    description: "Independently tested for quality and purity.",
  },
  {
    number: "02",
    icon: Microscope,
    title: "High Purity Peptides",
    description: "Premium purity backed by lab analysis.",
  },
  {
    number: "03",
    icon: Truck,
    title: "Fast US Shipping",
    description: "Quick and reliable delivery across US.",
  },
  {
    number: "04",
    icon: NotepadText,
    title: "COA Every Lot",
    description: "A certificate for each lot.",
  },
  {
    number: "05",
    icon: Headset,
    title: "Support 08:00 – 20:00",
    description: "Friendly support whenever you need help.",
  },
  {
    number: "06",
    icon: FlaskConical,
    title: "Research Use Only",
    description: "Strictly for laboratory research purposes.",
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const cardRef = useRef<HTMLElement>(null);
  const Icon = feature.icon;

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (!window.matchMedia("(hover: hover)").matches) return;

    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    card.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translateY(-5px)`;
  };

  const handleMouseLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform =
        "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)";
    }
  };

  return (
    <article
      ref={cardRef}
      data-aos="fade-up"
      data-aos-delay={index * 80}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group relative isolate flex flex-col rounded-[20px] p-[1.5px] transition-transform duration-300 hover:-translate-y-1 sm:rounded-[26px]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[20px] sm:rounded-[26px]">
        <div className="absolute inset-[-100%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0%,transparent_60%,#A87516_72%,#E4A60C_82%,#FFE49A_90%,#FFF3C6_95%,transparent_100%)] motion-reduce:animate-none" />
      </div>

      <div className="relative z-10 flex h-full flex-col overflow-hidden rounded-[18.5px] bg-white p-4 transition-colors duration-300 group-hover:bg-[#FCF6FD] sm:rounded-[24.5px] sm:p-6 lg:p-8">
        <div className="flex items-start justify-between">
          <div className="text-primary group-hover:border-primary group-hover:bg-primary flex size-11 items-center justify-center rounded-[14px] border border-[#E7D1EA] bg-[#F7ECF9] shadow-[0_5px_15px_rgba(85,32,95,0.05)] transition-all duration-500 group-hover:rotate-[-8deg] group-hover:text-white sm:size-14 sm:rounded-[18px]">
            <Icon size={23} strokeWidth={1.6} className="sm:size-[27px]" />
          </div>
        </div>

        <div className="mt-4 sm:mt-6">
          <h3 className="font-heading text-primary max-w-[270px] text-[17px] leading-[1.3] font-semibold tracking-[-0.045em] sm:text-xl lg:text-[23px]">
            {feature.title}
          </h3>

          <p className="text-muted mt-2 max-w-[310px] font-sans text-[12px] leading-relaxed sm:mt-3 sm:text-sm">
            {feature.description}
          </p>
        </div>

        <Icon
          size={135}
          strokeWidth={0.8}
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-6 size-24 rotate-[-18deg] text-[#E8C9ED]/50 transition-all duration-700 group-hover:-translate-x-3 group-hover:-translate-y-3 group-hover:rotate-0 group-hover:text-[#D9A4E2]/70 sm:-right-9 sm:-bottom-9 sm:size-[135px]"
        />

        <span className="bg-primary absolute right-3 bottom-3 flex size-8 translate-y-3 items-center justify-center rounded-full text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:right-5 sm:bottom-5 sm:size-9">
          <ArrowUpRight size={16} className="sm:size-[18px]" />
        </span>
      </div>
    </article>
  );
}

export default function WhyChooseUs() {
  useEffect(() => {
    AOS.init({
      duration: 850,
      easing: "ease-out-cubic",
      once: true,
      offset: 60,
    });
  }, []);

  return (
    <section
      id="why"
      aria-labelledby="why-title"
      className="relative overflow-hidden bg-[#FAF8FB] px-4 py-12 sm:px-6 md:py-16 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:mb-8 lg:flex-row lg:items-end">
          <div data-aos="fade-up">
            <p className="text-gold mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
              The Spectrum Difference
            </p>

            <h2 id="why-title" className="section-heading mt-2">
              Why Choose
              <br />
              Spectrum?
            </h2>
          </div>

          <p
            data-aos="fade-up"
            data-aos-delay="100"
            className="text-muted text-md max-w-[390px] font-sans"
          >
            Discover what sets Spectrum Biosciences apart, from independent
            laboratory testing to reliable service and research-focused
            standards.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {features.map((feature, index) => (
            <FeatureCard key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
