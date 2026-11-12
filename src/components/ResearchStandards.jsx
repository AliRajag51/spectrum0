"use client";

import { LordIcon } from "@lordicon/react";

const standards = [
  {
    title: "Research Focused",
    icon: "/assets/lord/research.json",
  },
  {
    title: "Quality Standards",
    icon: "/assets/lord/quality.json",
  },
  {
    title: "Third-Party Tested with COAs",
    icon: "/assets/lord/flask.json",
  },
  {
    title: "U.S. Manufacturing & Fulfillment",
    icon: "/assets/lord/truck.json",
  },
  {
    title: "Research Use Only (RUO)",
    icon: "/assets/lord/flask.json",
  },
];

function AnimatedIcon({ src }) {
  return (
    <LordIcon
      src={src}
      trigger="loop"
      colorize="#55205f"
      style={{
        width: 38,
        height: 38,
        flexShrink: 0,
      }}
    />
  );
}

export default function ResearchStandards() {
  return (
    <section
      aria-label="Spectrum research standards"
      className="bg-background relative w-full overflow-hidden"
    >
      {/* ANIMATED TOP GOLD BORDER */}
      <div
        aria-hidden="true"
        className="research-gold-line absolute inset-x-0 top-0 z-20 h-[2px]"
      />

      {/* SECTION CONTENT */}
      <div className="relative bg-linear-to-r from-[#FDF7FE] via-[#F5E6F9] to-[#FDF7FE]">
        <div className="research-standards-scroll flex w-full items-center overflow-x-auto">
          {standards.map((item, index) => (
            <article
              key={item.title}
              className="relative flex min-w-[210px] flex-1 shrink-0 items-center justify-center gap-3 px-5 py-3 lg:min-w-0 lg:px-4 lg:py-3"
            >
              {/* ANIMATED ICON */}
              <AnimatedIcon src={item.icon} />

              {/* CONTENT */}
              <h3 className="font-heading text-primary text-xs leading-tight font-medium sm:text-sm">
                {item.title}
              </h3>

              {/* THICKER GOLD SEPARATOR */}
              {index !== standards.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 right-0 h-8 w-[2px] -translate-y-1/2 rounded-full bg-linear-to-b from-[#A87516] via-[#E4A60C] to-[#FFD86B] shadow-[0_0_9px_rgba(228,166,12,0.3)]"
                />
              )}
            </article>
          ))}
        </div>
      </div>

      {/* ANIMATED BOTTOM GOLD BORDER */}
      <div
        aria-hidden="true"
        className="research-gold-line absolute inset-x-0 bottom-0 z-20 h-[2px]"
      />

      <style jsx global>{`
        /* =====================================
           ANIMATED GOLD TOP/BOTTOM LINES
        ===================================== */

        .research-gold-line {
          background: linear-gradient(
            90deg,
            #a87516 0%,
            #ffe6a2 20%,
            #e4a60c 40%,
            #fff3c6 60%,
            #a87516 80%,
            #ffe6a2 100%
          );

          background-size: 300% 100%;

          animation: research-gold-flow 5s linear infinite;

          box-shadow: 0 0 10px rgba(228, 166, 12, 0.22);
        }

        @keyframes research-gold-flow {
          0% {
            background-position: 100% 50%;
          }

          100% {
            background-position: 0% 50%;
          }
        }

        /* =====================================
           MOBILE HORIZONTAL SCROLL
        ===================================== */

        .research-standards-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .research-standards-scroll::-webkit-scrollbar {
          display: none;
        }

        /* =====================================
           ACCESSIBILITY
        ===================================== */

        @media (prefers-reduced-motion: reduce) {
          .research-gold-line {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
