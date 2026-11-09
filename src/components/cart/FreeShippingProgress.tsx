"use client";

import { Truck, Check } from "lucide-react";

import { formatCartMoney, useCart } from "@/context/CartContext";

export default function FreeShippingProgress({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    remaining,
    freeShippingProgress,
    qualifiesForFreeShipping,
    freeShippingThreshold,
  } = useCart();
  // No free-shipping rule in WooCommerce (or the store is unreachable): no promise.
  if (freeShippingThreshold === null) return null;

  return (
    <div
      className={`bg-primary relative overflow-hidden rounded-[18px] text-white ${
        compact ? "p-4" : "p-5"
      }`}
    >
      {/* DECORATIVE CIRCLE */}

      <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full border border-white/10" />

      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[#F6C8FB]">
          {qualifiesForFreeShipping ? <Check size={18} /> : <Truck size={18} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-sans text-xs leading-[1.6] font-semibold">
            {qualifiesForFreeShipping ? (
              "You've unlocked free shipping!"
            ) : (
              <>
                You're{" "}
                <strong className="text-[#FFB27E]">
                  {formatCartMoney(remaining)}
                </strong>{" "}
                away from free shipping
              </>
            )}
          </p>

          {/* PROGRESS BAR */}

          <div
            role="progressbar"
            aria-label="Free shipping progress"
            aria-valuenow={Math.round(freeShippingProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-[7px] overflow-hidden rounded-full bg-white/20"
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#F47735,#FFB27E)] transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, freeShippingProgress))}%`,
              }}
            />
          </div>

          <p className="mt-2 font-sans text-xs text-white/90">
            Free shipping over {formatCartMoney(freeShippingThreshold)} · Before
            taxes
          </p>
        </div>
      </div>
    </div>
  );
}
