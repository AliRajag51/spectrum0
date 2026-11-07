"use client";

import { useState } from "react";
import { ArrowUpRight, MapPin, Truck } from "lucide-react";
import usa from "@/data/us-map-data.json";

const hub = { x: 445.7, y: 379.2 };

type City = { name: string; x: number; y: number };

const destinations: City[] = [
  { name: "Seattle", x: 124.3, y: 51.6 },
  { name: "Los Angeles", x: 115.5, y: 314.8 },
  { name: "Denver", x: 328.9, y: 240.9 },
  { name: "Minneapolis", x: 546, y: 163 },
  { name: "Chicago", x: 575.2, y: 201.2 },
  { name: "Nashville", x: 614, y: 321 },
  { name: "New York", x: 768.3, y: 192.4 },
];

const stateNames: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const highlighted = new Set(["TX", "OK", "NM", "AR", "LA", "IA"]);

function curvedRoute(city: City) {
  const dx = city.x - hub.x;
  const dy = city.y - hub.y;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(68, distance * 0.18);
  const mx = (hub.x + city.x) / 2;
  const my = (hub.y + city.y) / 2;

  return `M ${hub.x} ${hub.y} Q ${mx - (dy / distance) * bend} ${my + (dx / distance) * bend} ${city.x} ${city.y}`;
}

export default function USShippingCoverage() {
  const [activeState, setActiveState] = useState("IA");
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  const selectedState = hoveredState || activeState;
  const selectedCity = hoveredCity || activeCity;
  const currentName = stateNames[selectedState] || selectedState;

  return (
    <section
      aria-labelledby="shipping-coverage-title"
      className="w-full overflow-hidden bg-white px-4 py-12 sm:px-6 md:py-16 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
              Shipping Coverage
            </p>

            <h2 id="shipping-coverage-title" className="section-heading">
              Across the <span className="text-secondary">United States.</span>
            </h2>

            <p className="text-md mt-4 max-w-xl text-[#817586]">
              Explore our illustrated domestic shipping network. Select a state
              or destination to learn more.
            </p>
          </div>

          <span className="text-primary inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[#EADDEB] bg-[#FBF7FC] px-4 py-2.5 text-xs font-semibold">
            <Truck size={16} />
            Domestic Shipping
          </span>
        </header>

        <div className="overflow-hidden rounded-[24px] border border-[#E8DCEA] bg-[#FAF6FC]">
          <div className="grid min-w-0 items-center gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-5 lg:p-7">
            <div className="relative flex min-w-0 items-center justify-center overflow-hidden rounded-[18px] bg-white/40 p-1 sm:p-3">
              <svg
                viewBox="0 0 900 540"
                role="img"
                aria-label="Interactive United States shipping map with illustrative routes from Dallas"
                preserveAspectRatio="xMidYMid meet"
                className="block h-auto w-full max-w-[760px] shrink-0"
              >
                <defs>
                  <linearGradient
                    id="shipping-land"
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#DCC4E6" />
                    <stop offset="100%" stopColor="#EEDFF3" />
                  </linearGradient>
                </defs>

                <path d={usa.outline} fill="url(#shipping-land)" />

                {usa.states.map((state) => {
                  const selected = selectedState === state.id;
                  const name = stateNames[state.id] || state.id;

                  return (
                    <path
                      key={state.id}
                      d={state.d}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${name}`}
                      aria-pressed={activeState === state.id}
                      fill={
                        selected
                          ? "#7F3889"
                          : highlighted.has(state.id)
                            ? "#B687C6"
                            : "#D8BEE2"
                      }
                      stroke="#FFFFFF"
                      strokeWidth={selected ? 2 : 1.25}
                      strokeLinejoin="round"
                      className="cursor-pointer transition-colors duration-300 outline-none focus:stroke-[#F47735]"
                      onMouseEnter={() => setHoveredState(state.id)}
                      onMouseLeave={() => setHoveredState(null)}
                      onFocus={() => setHoveredState(state.id)}
                      onBlur={() => setHoveredState(null)}
                      onClick={() => {
                        setActiveState(state.id);
                        setActiveCity(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveState(state.id);
                          setActiveCity(null);
                        }
                      }}
                    >
                      <title>{name}</title>
                    </path>
                  );
                })}

                {destinations.map((city, index) => {
                  const active = selectedCity === city.name;
                  const route = curvedRoute(city);

                  return (
                    <g key={city.name}>
                      <path
                        d={route}
                        fill="none"
                        stroke={active ? "#F47735" : "#6B2777"}
                        strokeWidth={active ? 2.8 : 1.5}
                        strokeDasharray="6 8"
                        strokeLinecap="round"
                        opacity={selectedCity && !active ? 0.25 : 0.8}
                        className="shipping-route pointer-events-none"
                      />

                      <circle
                        r={active ? 4.5 : 3}
                        fill={active ? "#F47735" : "#8E429B"}
                        opacity={selectedCity && !active ? 0.2 : 0.9}
                        className="pointer-events-none motion-reduce:hidden"
                      >
                        <animateMotion
                          dur={`${5 + index * 0.65}s`}
                          path={route}
                          repeatCount="indefinite"
                        />
                      </circle>

                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`Highlight route to ${city.name}`}
                        aria-pressed={activeCity === city.name}
                        className="cursor-pointer outline-none"
                        onMouseEnter={() => setHoveredCity(city.name)}
                        onMouseLeave={() => setHoveredCity(null)}
                        onFocus={() => setHoveredCity(city.name)}
                        onBlur={() => setHoveredCity(null)}
                        onClick={() => setActiveCity(city.name)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveCity(city.name);
                          }
                        }}
                      >
                        <circle
                          cx={city.x}
                          cy={city.y}
                          r="15"
                          fill="transparent"
                        />

                        {active && (
                          <circle
                            cx={city.x}
                            cy={city.y}
                            r="9"
                            fill="#F47735"
                            opacity="0.18"
                            className="motion-safe:animate-pulse"
                          />
                        )}

                        <circle
                          cx={city.x}
                          cy={city.y}
                          r={active ? 5.5 : 4}
                          fill={active ? "#F47735" : "white"}
                          stroke={active ? "#F47735" : "#55205F"}
                          strokeWidth="2"
                        />

                        <text
                          x={city.x + 9}
                          y={city.y - 8}
                          fontSize="12"
                          fontWeight="650"
                          fill={active ? "#F47735" : "#3E2145"}
                          stroke="#FFFFFF"
                          strokeWidth="3.5"
                          paintOrder="stroke"
                          fontFamily="Arial, sans-serif"
                          className="pointer-events-none"
                        >
                          {city.name}
                        </text>
                      </g>
                    </g>
                  );
                })}

                <circle
                  cx={hub.x}
                  cy={hub.y}
                  r="18"
                  fill="#55205F"
                  opacity="0.14"
                  className="motion-safe:animate-pulse"
                />

                <circle
                  cx={hub.x}
                  cy={hub.y}
                  r="9"
                  fill="#55205F"
                  stroke="white"
                  strokeWidth="3"
                />

                <text
                  x={hub.x + 15}
                  y={hub.y + 7}
                  fontSize="15"
                  fontWeight="700"
                  fill="#55205F"
                  stroke="#FFFFFF"
                  strokeWidth="4"
                  paintOrder="stroke"
                  className="pointer-events-none"
                >
                  Dallas
                </text>
              </svg>
            </div>

            <aside
              aria-label="Shipping information"
              className="rounded-[18px] border border-[#E8DCEA] bg-white p-5 shadow-[0_8px_25px_rgba(85,32,95,0.04)] sm:p-6"
            >
              <p className="text-secondary text-[11px] font-bold tracking-[0.15em] uppercase">
                Shipping Overview
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className="font-heading text-primary text-[38px] leading-none font-bold tracking-[-0.06em]">
                  US
                </span>

                <span className="text-primary text-[12px] font-semibold">
                  Domestic Delivery
                </span>
              </div>

              <div className="mt-5 border-t border-[#EEE6EF] pt-5">
                <div className="flex items-center gap-2">
                  <MapPin size={17} className="text-secondary shrink-0" />

                  <h3 className="font-heading text-primary text-[21px] font-bold">
                    {selectedCity || currentName}
                  </h3>
                </div>

                <p className="mt-3 text-[13px] leading-6 text-[#817586]">
                  {selectedCity
                    ? `Illustrative shipping route from Dallas to ${selectedCity}. Actual routes and delivery times depend on the carrier.`
                    : `Explore shipping information for ${currentName}. Availability and delivery estimates are confirmed at checkout.`}
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-[#EEE6EF] pt-5">
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-[#817586]">Service</span>

                  <strong className="text-primary text-right font-semibold">
                    Tracked Shipping*
                  </strong>
                </div>

                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-[#817586]">Coverage</span>

                  <strong className="text-primary text-right font-semibold">
                    United States
                  </strong>
                </div>
              </div>

              {activeCity && (
                <button
                  type="button"
                  onClick={() => setActiveCity(null)}
                  className="text-secondary hover:text-primary mt-5 inline-flex items-center gap-2 text-[12px] font-semibold transition-colors"
                >
                  Show all routes
                  <ArrowUpRight size={15} />
                </button>
              )}
            </aside>
          </div>

          <div className="flex items-start gap-2 border-t border-[#E8DCEA] bg-white px-4 py-3.5 text-[12px] leading-6 text-[#817586] sm:px-6">
            <MapPin size={16} className="text-primary mt-1 shrink-0" />

            <p>
              Select a state or destination to explore. Routes are illustrative,
              not live tracking. Carrier availability should be confirmed before
              publishing.
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .shipping-route {
          animation: shipping-flow 16s linear infinite;
        }

        @keyframes shipping-flow {
          to {
            stroke-dashoffset: -140;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .shipping-route {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
