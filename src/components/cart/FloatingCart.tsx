"use client";

import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatCartMoney, useCart } from "@/context/CartContext";

/* The always-reachable cart: a pill pinned bottom-right that opens the same
   drawer the header button does. State comes from CartContext, so it moves the
   moment an add or a removal lands. It stays off the pages where a basket
   button would be redundant or would interrupt a purchase, and on phones it
   rides above the product page's sticky add-to-cart bar. */

const HIDDEN_ON = ["/cart", "/checkout", "/account", "/track-order"];

export default function FloatingCart() {
  const pathname = usePathname() ?? "/";
  const { openCart, isOpen, itemCount, subtotal, hydrated } = useCart();
  const [bump, setBump] = useState(false);
  const previous = useRef(itemCount);

  /* A short pulse when something was added, not on every render. */
  useEffect(() => {
    if (hydrated && itemCount > previous.current) {
      setBump(true);
      const timer = window.setTimeout(() => setBump(false), 450);
      previous.current = itemCount;
      return () => window.clearTimeout(timer);
    }
    previous.current = itemCount;
  }, [itemCount, hydrated]);

  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;

  const count = hydrated ? itemCount : 0;
  const onProduct = pathname.startsWith("/products/");

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}
      aria-hidden={isOpen}
      tabIndex={isOpen ? -1 : 0}
      className={[
        "group fixed right-[max(16px,env(safe-area-inset-right))] z-[56] flex items-center gap-2.5 rounded-full",
        "bg-primary py-2 pr-2 pl-2 text-white sm:pr-4",
        "shadow-[0_18px_40px_-14px_rgba(53,20,62,0.6)] ring-1 ring-white/15",
        "transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#35143E]",
        "focus-visible:outline-secondary focus-visible:outline-3 focus-visible:outline-offset-3",
        onProduct
          ? "bottom-[calc(env(safe-area-inset-bottom)+104px)] lg:bottom-[max(24px,env(safe-area-inset-bottom))]"
          : "bottom-[max(20px,env(safe-area-inset-bottom))] sm:bottom-[max(24px,env(safe-area-inset-bottom))]",
        isOpen ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100",
        bump ? "scale-[1.06]" : "scale-100",
      ].join(" ")}
    >
      <span className="relative flex size-11 items-center justify-center rounded-full bg-white/12">
        <ShoppingBag size={20} strokeWidth={1.7} />
        {count > 0 && (
          <span className="bg-secondary ring-primary absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="hidden flex-col items-start leading-tight sm:flex">
        <span className="text-[11px] font-medium text-white/70">
          {count > 0 ? "Your cart" : "Cart"}
        </span>
        <span className="font-heading text-sm font-bold">
          {count > 0 ? formatCartMoney(subtotal) : "Empty"}
        </span>
      </span>
    </button>
  );
}
