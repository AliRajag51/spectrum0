"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag, X } from "lucide-react";
import { formatCartMoney, useCart } from "@/context/CartContext";
import CartLineItem from "./CartLineItem";
import CartSuggestions from "./CartSuggestions";
import FreeShippingProgress from "./FreeShippingProgress";

export default function CartDrawer() {
  const { isOpen, closeCart, items, itemCount, subtotal, hydrated, busy, error } =
    useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCart();
      if (event.key !== "Tab") return;
      const focusables = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) || []),
      ];
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      (previouslyFocusedRef.current as HTMLElement | null)?.focus?.();
    };
  }, [isOpen, closeCart]);

  if (!hydrated) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] ${isOpen ? "visible" : "pointer-events-none invisible"}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        tabIndex={isOpen ? 0 : -1}
        onClick={closeCart}
        aria-label="Close cart"
        className={`absolute inset-0 cursor-default bg-[#08162b]/55 backdrop-blur-[3px] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-white shadow-[-24px_0_80px_rgba(0,0,0,0.16)] transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[#e8edf4] px-5 py-4 sm:px-6">
          <div>
            <h2
              id="cart-drawer-title"
              className="font-heading text-[23px] font-bold tracking-tight text-[#0b1b3f]"
            >
              Research cart
            </h2>
            <p className="mt-0.5 text-xs text-[#8292a6]">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={closeCart}
            aria-label="Close cart drawer"
            className="grid size-10 place-items-center rounded-full text-[#0b1b3f] transition-colors hover:bg-[#edf4fc]"
          >
            <X size={21} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[170px_minmax(0,1fr)]">
          {/* Independent scrollable suggestion rail, inspired by the reference. */}
          <aside
            aria-label="Also available"
            className="hidden min-h-0 overflow-y-auto border-r border-[#e9eff5] bg-[#f5f8fc] p-3.5 lg:block"
          >
            <p className="mb-3 px-1 text-sm font-semibold text-[#0b1b3f]">
              Also available
            </p>
            <CartSuggestions />
          </aside>

          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-3 pb-6 sm:px-5">
              <FreeShippingProgress compact />
              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600"
                >
                  {error}
                </p>
              )}
              {!items.length ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-2 text-center">
                  <h3 className="font-heading mt-4 text-lg font-semibold">
                    Your cart is empty
                  </h3>
                  <p className="mt-2 max-w-xs text-sm text-[#788ca5]">
                    Explore the collection and choose a research compound to get
                    started.
                  </p>
                  <button
                    type="button"
                    onClick={closeCart}
                    className="mt-5 rounded-full bg-[#0b1b3f] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Continue shopping
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  {items.map((item) => (
                    <CartLineItem
                      key={item.key}
                      item={item}
                      onNavigate={closeCart}
                    />
                  ))}
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-[#e6edf5] bg-white px-3.5 py-4 shadow-[0_-12px_24px_rgba(10,30,60,0.04)] sm:px-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#0b1b3f]">
                  Total before shipping & tax
                </span>
                <span className="font-heading text-lg font-bold text-[#0b1b3f]">
                  {formatCartMoney(subtotal)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Link
                  href="/cart"
                  onClick={closeCart}
                  className="flex h-11 items-center justify-center rounded-full border border-[#d8e4f0] text-sm font-semibold text-[#0b1b3f] hover:bg-[#f5f9fe]"
                >
                  View cart
                </Link>
                {/* A full navigation: WooCommerce takes the order from here. */}
                <a
                  href="/api/checkout"
                  aria-disabled={busy}
                  onClick={(event) => {
                    // Let a pending cart write land before handing the basket over.
                    if (busy) event.preventDefault();
                  }}
                  className="bg-primary flex min-h-11 w-full items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[#28558f] aria-disabled:pointer-events-none aria-disabled:opacity-60"
                >
                  Proceed to Checkout
                </a>
              </div>
            </footer>
          </div>
        </div>
      </aside>
    </div>
  );
}
