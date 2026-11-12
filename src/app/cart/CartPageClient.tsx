"use client";

import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  ShieldCheck,
  LockKeyhole,
  FlaskConical,
  PackageCheck,
  Trash2,
  ChevronRight,
  Sparkles,
} from "lucide-react";

import { formatCartMoney, useCart } from "@/context/CartContext";

import CartLineItem from "@/components/cart/CartLineItem";
import FreeShippingProgress from "@/components/cart/FreeShippingProgress";

/* =====================================================
   EMPTY CART
===================================================== */

function EmptyCart() {
  return (
    <div className="relative flex min-h-[430px] flex-col items-center justify-center overflow-hidden rounded-[24px] bg-[#FCF8FD] px-5 py-14 text-center sm:min-h-[480px]">
      {/* DECORATIVE ELEMENTS */}

      <div className="pointer-events-none absolute -top-20 -right-20 h-[260px] w-[260px] rounded-full bg-[#F4DDF7]/60 blur-[70px]" />

      <div className="pointer-events-none absolute -bottom-24 -left-20 h-[260px] w-[260px] rounded-full bg-[#F6E5F7] blur-[70px]" />

      <div className="relative z-10 flex flex-col items-center">
        {/* ICON */}

        <div className="relative mb-7">
          <div className="border-primary/10 flex h-[105px] w-[105px] items-center justify-center rounded-[30px] border bg-white shadow-[0_20px_55px_rgba(85,32,95,0.08)]">
            <ShoppingBag size={43} strokeWidth={1.3} className="text-primary" />
          </div>

          <span className="bg-gold absolute -top-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg">
            <Sparkles size={17} />
          </span>
        </div>

        {/* CONTENT */}

        <span className="text-gold mb-3 font-sans text-[10px] font-bold tracking-[0.18em] uppercase">
          Your Research Collection Awaits
        </span>

        <h2 className="font-heading text-[clamp(26px,4vw,36px)] leading-tight font-bold tracking-[-0.055em] text-[#29232D]">
          Your Cart Is Empty<span className="text-gold">.</span>
        </h2>

        <p className="mt-4 max-w-[380px] font-sans text-[13px] leading-[1.9] text-[#817586] sm:text-[14px]">
          Your next discovery starts here. Explore our research collection and
          add products to your cart.
        </p>

        {/* CTA */}

        <Link
          href="/shop"
          className="group bg-primary mt-8 inline-flex items-center gap-6 rounded-full p-2 pl-7 font-sans text-[12px] font-bold text-white shadow-[0_12px_30px_rgba(85,32,95,0.16)] transition-all duration-300 hover:bg-[#35143E] hover:shadow-[0_18px_40px_rgba(85,32,95,0.22)] sm:text-[13px]"
        >
          Explore Collection
          <span className="text-primary flex h-11 w-11 items-center justify-center rounded-full bg-white transition-transform duration-300 group-hover:rotate-45">
            <ArrowUpRight size={20} />
          </span>
        </Link>
      </div>
    </div>
  );
}

/* =====================================================
   CART PAGE
===================================================== */

export default function CartPageClient({
  checkoutNotice = null,
}: {
  checkoutNotice?: string | null;
}) {
  const { items, itemCount, subtotal, hydrated, clearCart, busy, error } =
    useCart();

  const hasItems = hydrated && items.length > 0;

  // The Bundle & Save saving WooCommerce applied to each line.
  const bundleSavings = items.reduce(
    (total, item) => total + item.bundleSavings,
    0,
  );

  return (
    <main className="">
      {/* ==========================================
          PAGE HEADER
      ========================================== */}

      <section className="px-4 py-6 sm:px-6 md:py-12 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="mb-7">
            <ol className="flex items-center gap-2 font-sans text-xs text-[#96899A]">
              <li>
                <Link href="/" className="hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <ChevronRight size={14} />
              </li>
              <li className="text-primary font-semibold">Shopping Cart</li>
            </ol>
          </nav>

          <div className="flex flex-col justify-between gap-6 border-b border-[#EEE6EF] pb-8 sm:flex-row sm:items-end">
            <div>
              <span className="text-gold mb-3 block font-sans text-[11px] font-semibold tracking-[0.14em] uppercase">
                Spectrum Biosciences
              </span>
              <h1 className="section-heading">
                Shopping Cart<span className="text-gold">.</span>
              </h1>
              <p className="mt-3 font-sans text-sm text-[#817586]">
                {!hydrated
                  ? "Loading your cart..."
                  : itemCount === 0
                    ? "Your cart is currently empty."
                    : `${itemCount} ${itemCount === 1 ? "bottle" : "bottles"} in your cart`}
              </p>
            </div>

            <Link
              href="/shop"
              className="group border-primary/20 text-primary hover:border-primary hover:bg-primary inline-flex w-fit items-center gap-2 rounded-full border px-5 py-3 font-sans text-[12px] font-semibold transition-all duration-300 hover:text-white"
            >
              <ArrowLeft
                size={16}
                className="transition-transform duration-300 group-hover:-translate-x-1"
              />
              Continue Shopping
            </Link>
          </div>
        </div>
      </section>

      {/* ==========================================
          CART CONTENT
      ========================================== */}

      <section className="px-4 pb-12 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_390px] xl:gap-10">
            {/* ======================================
                LEFT SIDE - CART ITEMS
            ====================================== */}

            <section aria-label="Shopping cart items" className="min-w-0">
              {/* SECTION HEADER */}

              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-[22px] font-bold tracking-[-0.045em] text-[#29232D] sm:text-[25px]">
                    Selected Products
                  </h2>

                  {hasItems && (
                    <span className="text-primary flex h-7 min-w-7 items-center justify-center rounded-full bg-[#F6E5F7] px-2 font-sans text-[11px] font-bold">
                      {itemCount}
                    </span>
                  )}
                </div>

                {hasItems && (
                  <button
                    type="button"
                    onClick={clearCart}
                    disabled={busy}
                    className="group inline-flex items-center gap-2 font-sans text-[11px] font-semibold text-[#978A9A] transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[12px]"
                  >
                    <Trash2 size={15} />
                    Clear Cart
                  </button>
                )}
              </div>

              {/* CART PRODUCTS */}

              {!hydrated ? (
                <div className="rounded-[24px] border border-[#EEE6EF] bg-white p-6 sm:p-8">
                  <div
                    role="status"
                    className="flex min-h-[220px] items-center justify-center font-sans text-[13px] text-[#817586]"
                  >
                    Loading your cart...
                  </div>
                </div>
              ) : hasItems ? (
                <div className="overflow-hidden rounded-[24px] border border-[#EEE6EF] bg-white px-4 shadow-[0_12px_35px_rgba(85,32,95,0.035)] sm:px-6">
                  {items.map((item) => (
                    <CartLineItem key={item.key} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyCart />
              )}

              {/* BOTTOM TRUST STRIP */}

              {hasItems && (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: ShieldCheck,
                      title: "Secure Checkout",
                      text: "Protected checkout process",
                    },
                    {
                      icon: FlaskConical,
                      title: "Research Focused",
                      text: "For laboratory research only",
                    },
                    {
                      icon: PackageCheck,
                      title: "Order Information",
                      text: "Details provided at checkout",
                    },
                  ].map((feature) => {
                    const Icon = feature.icon;

                    return (
                      <div
                        key={feature.title}
                        className="flex items-start gap-3 rounded-[16px] border border-[#EEE6EF] bg-[#FCFAFC] p-4"
                      >
                        <span className="text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-[11px] bg-[#F5E7F7]">
                          <Icon size={18} strokeWidth={1.7} />
                        </span>

                        <div>
                          <h3 className="text-md font-sans font-semibold text-[#29232D]">
                            {feature.title}
                          </h3>

                          <p className="font-sans text-xs leading-relaxed text-[#8A7D8F]">
                            {feature.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ======================================
                RIGHT SIDE - ORDER SUMMARY
            ====================================== */}

            <aside
              aria-label="Order summary"
              className="lg:sticky lg:top-[105px]"
            >
              <div className="overflow-hidden rounded-[26px] border border-[#EBE1EC] bg-white shadow-[0_20px_60px_rgba(85,32,95,0.07)]">
                {/* SUMMARY HEADER */}

                <div className="flex items-center justify-between border-b border-[#EEE6EF] px-5 py-5 sm:px-6">
                  <div>
                    <h2 className="font-heading text-xl font-bold text-[#29232D]">
                      Order summary
                    </h2>
                    <p className="mt-1 text-sm text-[#817586]">
                      Review products before payment
                    </p>
                  </div>
                  <span className="text-primary rounded-full bg-[#F6E5F7] px-3 py-1 text-xs font-semibold">
                    {itemCount} bottles
                  </span>
                </div>

                {/* SUMMARY CONTENT */}

                <div className="space-y-6 p-5 sm:p-7">
                  {(checkoutNotice || error) && (
                    <p
                      role="alert"
                      className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 font-sans text-[12px] leading-relaxed text-red-600"
                    >
                      {error || checkoutNotice}
                    </p>
                  )}

                  {/* SHIPPING PROGRESS */}

                  <FreeShippingProgress />

                  {/* PRICE BREAKDOWN */}

                  <div className="space-y-4 border-b border-[#EEE6EF] pb-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-sans text-[13px] text-[#817586]">
                        Subtotal
                      </span>

                      <span className="font-sans text-[13px] font-bold text-[#29232D]">
                        {formatCartMoney(subtotal)}
                      </span>
                    </div>

                    {/* BUNDLE SAVINGS */}

                    {bundleSavings > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gold flex items-center gap-2 font-sans text-[12px] font-semibold">
                          <Sparkles size={15} />
                          Bundle Savings
                        </span>

                        <span className="text-gold font-sans text-[13px] font-bold">
                          -{formatCartMoney(bundleSavings)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <span className="font-sans text-[13px] text-[#817586]">
                        Shipping
                      </span>

                      <span className="max-w-[165px] text-right font-sans text-[12px] text-[#817586]">
                        Calculated at checkout
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <span className="font-sans text-[13px] text-[#817586]">
                        Taxes
                      </span>

                      <span className="font-sans text-[12px] text-[#817586]">
                        Calculated at checkout
                      </span>
                    </div>
                  </div>

                  {/* TOTAL */}

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-heading text-base font-semibold text-[#29232D]">
                        Total
                      </span>
                    </div>

                    <strong className="font-heading text-primary text-[clamp(25px,3vw,32px)] font-extrabold tracking-[-0.06em]">
                      {formatCartMoney(subtotal)}
                    </strong>
                  </div>

                  {/* CHECKOUT BUTTON */}

                  {/* A full navigation: WooCommerce takes the order from here. */}
                  <a
                    href={hasItems ? "/api/checkout" : "/shop"}
                    aria-disabled={busy}
                    onClick={(event) => {
                      // Let a pending cart write land before handing the basket over.
                      if (busy) event.preventDefault();
                    }}
                    className="group bg-primary flex w-full items-center justify-between rounded-full p-2 pl-6 font-sans text-sm font-semibold text-white shadow-[0_12px_25px_rgba(85,32,95,0.17)] transition-all duration-300 hover:bg-[#35143E] hover:shadow-[0_18px_35px_rgba(85,32,95,0.25)] aria-disabled:pointer-events-none aria-disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <LockKeyhole size={16} />

                      {hasItems ? "Proceed to Checkout" : "Explore Products"}
                    </span>

                    <span className="text-primary flex h-11 w-11 items-center justify-center rounded-full bg-white transition-transform duration-300 group-hover:rotate-45">
                      <ArrowUpRight size={19} />
                    </span>
                  </a>

                  {/* SECURE NOTE */}

                  <p className="flex items-center justify-center gap-2 font-sans text-sm text-[#998D9C]">
                    <LockKeyhole size={12} />
                    Secure checkout · Research use only
                  </p>
                </div>
              </div>

              {/* CONTINUE SHOPPING */}

              <Link
                href="/shop"
                className="group text-primary hover:text-gold mt-5 flex items-center justify-center gap-2 font-sans text-[12px] font-semibold transition-colors"
              >
                <ArrowLeft
                  size={15}
                  className="transition-transform group-hover:-translate-x-1"
                />
                Continue Shopping
              </Link>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
