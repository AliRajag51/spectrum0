"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  PackageCheck,
  ClipboardCheck,
  Package,
  Truck,
  MapPinned,
  ArrowUpRight,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    number: "01",
    title: "Order Received",
    description: "Order and address captured.",
    icon: PackageCheck,
    x: 80,
    y: 140,
    mobileX: 32,
  },
  {
    number: "02",
    title: "Details Reviewed",
    description: "Usually 1–3 business days.",
    icon: ClipboardCheck,
    x: 310,
    y: 205,
    mobileX: 50,
  },
  {
    number: "03",
    title: "Parcel Prepared",
    description: "Packed and batch-labelled.",
    icon: Package,
    x: 555,
    y: 110,
    mobileX: 32,
  },
  {
    number: "04",
    title: "Carrier Handoff",
    description: "Handed to UPS.",
    icon: Truck,
    x: 790,
    y: 195,
    mobileX: 50,
  },
  {
    number: "05",
    title: "Tracking Active",
    description: "Tracking sent by email.",
    icon: MapPinned,
    x: 1100,
    y: 90,
    mobileX: 32,
  },
];

const desktopPath =
  "M 80 140 C 170 140 215 205 310 205 C 410 205 455 110 555 110 C 655 110 690 195 790 195 C 915 195 980 90 1100 90";

const mobilePath =
  "M 32 62 C 65 95 65 150 50 186 C 20 230 20 275 32 310 C 60 360 65 400 50 434 C 20 478 20 530 32 558";

type TimelineProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pathRef: React.RefObject<SVGPathElement | null>;
};

function DesktopTimeline({ containerRef, pathRef }: TimelineProps) {
  return (
    <div
      ref={containerRef}
      className="relative mx-auto hidden h-80 w-full max-w-300 lg:block"
    >
      <svg
        viewBox="0 0 1200 360"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path
          d={desktopPath}
          fill="none"
          stroke="#F47735"
          strokeOpacity="0.12"
          strokeWidth="2.5"
        />

        <path
          ref={pathRef}
          d={desktopPath}
          fill="none"
          stroke="#F47735"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      {steps.map((step) => {
        const Icon = step.icon;

        return (
          <article
            key={step.number}
            className="desktop-step absolute z-10"
            style={{
              left: `${(step.x / 1200) * 100}%`,
              top: `${(step.y / 360) * 100}%`,
            }}
          >
            <div className="absolute top-0 left-0 z-20 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white bg-[#F47735] shadow-[0_0_0_1px_rgba(244,119,53,0.18)]" />

            <div className="absolute top-5 left-1/2 w-[180px] -translate-x-1/2 xl:w-[205px]">
              <div className="relative">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F6E5F7]">
                    <Icon size={20} strokeWidth={1.7} />
                  </span>

                  <span className="font-heading text-primary/10 text-[28px] font-extrabold tracking-[-0.07em]">
                    {step.number}
                  </span>
                </div>

                <h3 className="font-heading text-primary text-[15px] leading-tight font-bold tracking-[-0.04em] xl:text-[17px]">
                  {step.title}
                </h3>

                <p className="text-muted mt-2 font-sans text-sm leading-[1.6]">
                  {step.description}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobileTimeline({ containerRef, pathRef }: TimelineProps) {
  return (
    <div
      ref={containerRef}
      className="relative mx-auto mt-8 w-full max-w-[600px] md:hidden"
    >
      <svg
        viewBox="0 0 90 620"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-[620px] w-[90px]"
      >
        <path
          d={mobilePath}
          fill="none"
          stroke="#F47735"
          strokeOpacity="0.12"
          strokeWidth="2"
        />

        <path
          ref={pathRef}
          d={mobilePath}
          fill="none"
          stroke="#F47735"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative">
        {steps.map((step) => {
          const Icon = step.icon;

          return (
            <article
              key={step.number}
              className="mobile-step relative flex h-[124px] w-full items-center pr-1 pl-[105px] sm:pl-[125px]"
            >
              <span
                className="bg-secondary absolute top-1/2 z-10 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[4px] border-white shadow-[0_0_0_1px_rgba(244,119,53,0.2)]"
                style={{ left: `${step.mobileX}px` }}
              />

              <div className="relative min-w-0">
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F6E5F7]">
                    <Icon size={19} strokeWidth={1.7} />
                  </span>

                  <span className="font-heading text-primary/15 text-[23px] font-bold tracking-[-0.06em]">
                    {step.number}
                  </span>
                </div>

                <h3 className="font-heading text-primary text-[17px] leading-tight font-bold tracking-[-0.04em] sm:text-[20px]">
                  {step.title}
                </h3>

                <p className="text-muted mt-1.5 font-sans text-[12px] leading-[1.5] sm:text-[13px]">
                  {step.description}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TabletTimeline({ containerRef, pathRef }: TimelineProps) {
  return (
    <div
      ref={containerRef}
      className="relative mx-auto mt-10 hidden h-[580px] w-full max-w-[850px] md:block lg:hidden"
    >
      <svg
        viewBox="0 0 800 580"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          d="M400 35 C470 90 470 140 400 160 S330 250 400 270 S470 360 400 380 S330 470 400 490 S470 550 400 560"
          fill="none"
          stroke="#F47735"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
        <path
          ref={pathRef}
          d="M400 35 C470 90 470 140 400 160 S330 250 400 270 S470 360 400 380 S330 470 400 490 S470 550 400 560"
          fill="none"
          stroke="#F47735"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      {steps.map((step, index) => {
        const Icon = step.icon;
        const leftSide = index % 2 === 0;

        return (
          <article
            key={step.number}
            className={`tablet-step absolute w-[38%] ${
              leftSide ? "left-[3%] text-right" : "right-[3%] text-left"
            }`}
            style={{ top: `${index * 108 + 10}px` }}
          >
            <div
              className={`flex items-center gap-3 ${
                leftSide ? "justify-end" : "justify-start"
              }`}
            >
              <span className="font-heading text-primary/10 text-[34px] font-extrabold tracking-[-0.07em]">
                {step.number}
              </span>

              <span className="text-primary flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F6E5F7]">
                <Icon size={22} strokeWidth={1.7} />
              </span>
            </div>

            <h3 className="font-heading text-primary mt-2 text-[19px] font-bold tracking-[-0.04em]">
              {step.title}
            </h3>

            <p className="text-muted mt-1 font-sans text-[13px]">
              {step.description}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export default function HowItWorks() {
  const desktopRef = useRef<HTMLDivElement>(null);
  const desktopPathRef = useRef<SVGPathElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const mobilePathRef = useRef<SVGPathElement>(null);
  const tabletRef = useRef<HTMLDivElement>(null);
  const tabletPathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia();

    const animateTimeline = (
      container: HTMLDivElement | null,
      path: SVGPathElement | null,
      stepSelector: string,
    ) => {
      if (!container || !path) return;

      const length = path.getTotalLength();
      const cards = container.querySelectorAll(stepSelector);

      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      gsap.set(cards, {
        autoAlpha: 0,
        y: 20,
      });

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top 80%",
          once: true,
        },
      });

      timeline.to(path, {
        strokeDashoffset: 0,
        duration: 2.5,
        ease: "power2.inOut",
      });

      timeline.to(
        cards,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.35,
          ease: "back.out(1.4)",
        },
        0.25,
      );
    };

    mm.add("(min-width: 1024px)", () => {
      animateTimeline(
        desktopRef.current,
        desktopPathRef.current,
        ".desktop-step",
      );
    });

    mm.add("(min-width: 768px) and (max-width: 1023px)", () => {
      animateTimeline(tabletRef.current, tabletPathRef.current, ".tablet-step");
    });

    mm.add("(max-width: 767px)", () => {
      animateTimeline(mobileRef.current, mobilePathRef.current, ".mobile-step");
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="relative overflow-hidden bg-white px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="relative mx-auto max-w-7xl">
        <header className="relative z-10 max-w-[720px]">
          <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
            From Order to Delivery
          </p>

          <h2 id="how-it-works-title" className="section-heading">
            How It <span className="text-secondary">Works.</span>
          </h2>

          <p className="text-muted text-md mt-3 max-w-[540px] font-sans">
            From placing your order to receiving tracking information, discover
            our simple five-step process.
          </p>
        </header>

        <DesktopTimeline containerRef={desktopRef} pathRef={desktopPathRef} />

        <TabletTimeline containerRef={tabletRef} pathRef={tabletPathRef} />

        <MobileTimeline containerRef={mobileRef} pathRef={mobilePathRef} />
      </div>
    </section>
  );
}
