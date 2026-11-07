"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";

export default function CartButton({ className = "" }: { className?: string }) {
  const { openCart, itemCount, hydrated } = useCart();
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`Open cart, ${hydrated ? itemCount : 0} items`}
      className={`relative inline-flex size-11 items-center justify-center rounded-full border border-[#b9dcd9] bg-white text-[#0b1b3f] transition-all duration-300 hover:border-[#00bfa5] hover:bg-[#f0fffc] ${className} `}
    >
      <ShoppingBag size={19} strokeWidth={1.6} />

      {hydrated && itemCount > 0 && (
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#397fce] text-[10px] font-bold text-white ring-2 ring-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}
