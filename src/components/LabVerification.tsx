"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Fingerprint,
  Activity,
  Scale,
  ShieldCheck,
  ScanSearch,
  FileCheck2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Check = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  position: string;
};

type Connection = { d: string; x: number; y: number } | null;

const checks: Check[] = [
  {
    id: "01",
    icon: Fingerprint,
    title: "Identification",
    detail: "HPLC + LC-MS",
    position: "lg:left-[2%] lg:top-[5%]",
  },
  {
    id: "02",
    icon: Activity,
    title: "Purity",
    detail: "Chromatographic analysis",
    position: "lg:right-[2%] lg:top-[5%]",
  },
  {
    id: "03",
    icon: Scale,
    title: "Net Content",
    detail: "Measured mass per vial",
    position: "lg:left-0 lg:top-[41%]",
  },
  {
    id: "04",
    icon: ShieldCheck,
    title: "Endotoxins",
    detail: "Bacterial endotoxin screen",
    position: "lg:right-0 lg:top-[41%]",
  },
  {
    id: "05",
    icon: ScanSearch,
    title: "Sterility",
    detail: "Laboratory screening",
    position: "lg:left-[5%] lg:bottom-[4%]",
  },
  {
    id: "06",
    icon: FileCheck2,
    title: "Lot Traceability",
    detail: "Batch certificate matching",
    position: "lg:right-[5%] lg:bottom-[4%]",
  },
];

function VerificationCard({
  item,
  cardRef,
}: {
  item: Check;
  cardRef: (element: HTMLDivElement | null) => void;
}) {
  const Icon = item.icon;

  return (
    <div
      ref={cardRef}
      className={`relative min-w-0 lg:absolute lg:w-[250px] xl:w-[280px] ${item.position}`}
    >
      <article className="verification-card group hover:border-primary/30 relative flex h-full min-w-0 flex-col items-center rounded-[16px] border border-[#EEE3F0] bg-white px-2 py-4 text-center shadow-[0_12px_35px_rgba(85,32,95,0.07)] transition-[border-color,box-shadow] duration-300 hover:shadow-[0_18px_45px_rgba(85,32,95,0.12)] sm:min-h-[105px] sm:flex-row sm:gap-4 sm:rounded-[18px] sm:p-4 sm:text-left lg:p-5">
        <div className="text-primary group-hover:bg-primary flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4E7F6] transition-colors duration-300 group-hover:text-white sm:size-12 sm:rounded-[14px]">
          <Icon size={21} strokeWidth={1.7} className="sm:h-6 sm:w-6" />
        </div>

        <div className="mt-3 min-w-0 sm:mt-0">
          <h3 className="font-heading text-primary text-md leading-tight font-bold tracking-[-0.035em] sm:text-[17px] lg:text-[19px]">
            {item.title}
          </h3>

          <p className="mt-1.5 text-sm leading-[1.5] text-[#817586] sm:mt-1 sm:text-[12px] sm:leading-5 lg:text-[13px]">
            {item.detail}
          </p>
        </div>
      </article>
    </div>
  );
}

export default function LabVerification() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);

  const animationCompletedRef = useRef(false);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
  });

  // Calculate connection lines for all screen sizes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const product = productRef.current;

    if (!stage || !product) return;

    let frame = 0;

    const updateConnections = () => {
      cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        const stageRect = stage.getBoundingClientRect();
        const productRect = product.getBoundingClientRect();

        const isMobileOrTablet = window.innerWidth < 1024;

        const startX =
          productRect.left + productRect.width / 2 - stageRect.left;

        const startY = isMobileOrTablet
          ? productRect.bottom - stageRect.top - 10
          : productRect.top + productRect.height / 2 - stageRect.top;

        const paths = checks.map((_, index) => {
          const card = cardRefs.current[index];

          if (!card) return null;

          const rect = card.getBoundingClientRect();

          const cardCenterX = rect.left + rect.width / 2 - stageRect.left;

          const cardCenterY = rect.top + rect.height / 2 - stageRect.top;

          const endX = isMobileOrTablet
            ? cardCenterX
            : cardCenterX < startX
              ? rect.right - stageRect.left
              : rect.left - stageRect.left;

          const endY = isMobileOrTablet
            ? rect.top - stageRect.top
            : cardCenterY;

          const dx = endX - startX;
          const dy = endY - startY;

          let d: string;

          if (isMobileOrTablet) {
            // Mobile/tablet: animated lines flow downward
            // from the bottle toward each card.
            const curve = Math.max(24, Math.min(90, dy * 0.3));

            d = `
              M ${startX} ${startY}
              C ${startX} ${startY + curve},
                ${endX} ${endY - curve},
                ${endX} ${endY}
            `;
          } else {
            // Desktop: lines extend sideways to floating cards.
            d = `
              M ${startX} ${startY}
              C ${startX + dx * 0.45} ${startY},
                ${endX - dx * 0.3} ${endY},
                ${endX} ${endY}
            `;
          }

          return {
            d,
            x: endX,
            y: endY,
          };
        });

        setDimensions({
          width: stageRect.width,
          height: stageRect.height,
        });

        setConnections(paths);
      });
    };

    updateConnections();

    const observer = new ResizeObserver(updateConnections);

    observer.observe(stage);
    observer.observe(product);

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    window.addEventListener("resize", updateConnections);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateConnections);
    };
  }, []);

  // Animate orange connection lines and verification cards.
  useEffect(() => {
    if (connections.length !== checks.length) return;
    if (connections.some((connection) => !connection)) return;

    const found = checks.map((_, index) => ({
      card: cardRefs.current[index]?.querySelector<HTMLElement>(
        ".verification-card",
      ),
      path: pathRefs.current[index],
      dot: dotRefs.current[index],
    }));

    // Prevent GSAP errors when SVG refs change on resize.
    const elements = found.flatMap(({ card, path, dot }) =>
      card && path && dot ? [{ card, path, dot }] : [],
    );
    if (elements.length !== found.length) {
      return;
    }

    const ctx = gsap.context(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      // Don't replay the entire animation after resizing.
      if (reducedMotion || animationCompletedRef.current) {
        elements.forEach(({ card, path, dot }) => {
          gsap.set(card, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
          });

          gsap.set(path, {
            strokeDasharray: "none",
            strokeDashoffset: 0,
          });

          gsap.set(dot, {
            autoAlpha: 1,
          });
        });

        return;
      }

      elements.forEach(({ card, path, dot }) => {
        if (!path) return;
        const length = path.getTotalLength();

        gsap.set(card, {
          autoAlpha: 0,
          y: 24,
          scale: 0.92,
        });

        gsap.set(path, {
          strokeDasharray: length,
          strokeDashoffset: length,
        });

        gsap.set(dot, {
          autoAlpha: 0,
        });
      });

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: stageRef.current,
          start: "top 78%",
          once: true,
        },
        onComplete: () => {
          animationCompletedRef.current = true;
        },
      });

      elements.forEach(({ card, path, dot }, index) => {
        const start = index * 0.3;

        timeline.to(
          path,
          {
            strokeDashoffset: 0,
            duration: 0.8,
            ease: "power2.inOut",
          },
          start,
        );

        timeline.to(
          dot,
          {
            autoAlpha: 1,
            duration: 0.2,
            ease: "power2.out",
          },
          start + 0.6,
        );

        timeline.to(
          card,
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            ease: "back.out(1.4)",
          },
          start + 0.55,
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [connections]);

  return (
    <section
      ref={sectionRef}
      id="lab-verification"
      aria-labelledby="verification-title"
      className="overflow-hidden bg-white px-4 py-12 sm:px-6 md:py-16 lg:px-10"
    >
      <div className="mx-auto max-w-7xl">
        {/* SECTION HEADING */}

        <header className="mx-auto max-w-3xl text-center">
          <h2 id="verification-title" className="section-heading mt-2">
            Six Checks.
            <br />
            <span className="text-secondary">One Clearer Record.</span>
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#817586] sm:text-base">
            Explore the analytical checks that help document research compounds
            and their batch-specific information.
          </p>
        </header>

        {/* VERIFICATION STAGE */}

        <div
          ref={stageRef}
          className="relative mt-10 flex flex-col items-center lg:mt-14 lg:block lg:h-[530px]"
        >
          {/* ANIMATED CONNECTION LINES */}

          {dimensions.width > 0 && connections.length === checks.length && (
            <svg
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
            >
              {connections.map((connection, index) => {
                if (!connection) return null;

                return (
                  <g key={checks[index].id}>
                    {/* Subtle background line */}

                    <path
                      d={connection.d}
                      fill="none"
                      stroke="#55205F"
                      strokeWidth="2"
                      strokeOpacity="0.1"
                    />

                    {/* Animated orange line */}

                    <path
                      ref={(element) => {
                        pathRefs.current[index] = element;
                      }}
                      d={connection.d}
                      fill="none"
                      stroke="#F47735"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Endpoint dot */}

                    <circle
                      ref={(element) => {
                        dotRefs.current[index] = element;
                      }}
                      cx={connection.x}
                      cy={connection.y}
                      r="5"
                      fill="#F47735"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* CENTER PRODUCT */}

          <div className="relative z-10 flex w-full flex-col items-center lg:absolute lg:top-1/2 lg:left-1/2 lg:w-[280px] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <div
              ref={productRef}
              className="relative h-[240px] w-[185px] sm:h-[300px] sm:w-[230px] lg:h-[350px] lg:w-[270px]"
            >
              <div className="absolute inset-5 rounded-full bg-[#F2DDF5]/70 blur-[45px]" />

              <Image
                src="/assets/5-amino-hero.png"
                alt="Spectrum Biosciences research product"
                fill
                sizes="(max-width: 640px) 185px, (max-width: 1024px) 230px, 270px"
                className="product-float relative object-contain drop-shadow-[0_25px_25px_rgba(85,32,95,0.2)]"
              />
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-full border border-[#E8DCEA] bg-white px-4 py-2 shadow-sm sm:px-5 sm:py-2.5">
              <span className="bg-secondary size-2 rounded-full" />

              <span className="text-primary text-[11px] font-semibold sm:text-[12px]">
                Spectrum Biosciences
              </span>
            </div>
          </div>

          {/* SIX VERIFICATION CARDS */}

          <div className="relative z-10 mt-10 grid w-full grid-cols-2 items-stretch gap-x-3 gap-y-10 sm:gap-x-5 sm:gap-y-12 lg:mt-0 lg:block lg:h-full">
            {checks.map((item, index) => (
              <VerificationCard
                key={item.id}
                item={item}
                cardRef={(element: HTMLDivElement | null) => {
                  cardRefs.current[index] = element;
                }}
              />
            ))}
          </div>
        </div>

        {/* BOTTOM CONTENT */}

        <div className="mt-14 text-center lg:mt-6">
          <h3 className="font-heading text-primary text-[24px] font-bold tracking-[-0.04em] sm:text-[30px]">
            Follow the Lot. Verify the Record.
          </h3>

          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-7 text-[#817586]">
            Testing information varies by product and batch. Consult the
            available certificate for specific analytical results.
          </p>
        </div>
      </div>
    </section>
  );
}
