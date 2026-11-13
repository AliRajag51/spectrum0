"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Marquee from "react-fast-marquee";
import {
  Menu,
  X,
  Search,
  UserRound,
  ShoppingBag,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  FlaskConical,
  ChevronRight,
} from "lucide-react";

import { useCart } from "@/context/CartContext";
import HeaderSearch from "./HeaderSearch";

const navLinks = [
  { name: "Shop", href: "/shop" },
  { name: "COA", href: "/coa" },
  { name: "About", href: "/about" },
  { name: "FAQs", href: "/faqs" },
  { name: "Contact", href: "/contact" },
  { name: "Partner Program", href: "/partner-program" },
  { name: "Track Order", href: "/track-order" },
];

function AnnouncementContent() {
  return (
    <div className="flex shrink-0 items-center gap-5 pr-5 sm:gap-6 sm:pr-6 lg:gap-8 lg:pr-0">
      {/* US FLAG + FIRST MESSAGE */}
      <div className="flex shrink-0 items-center gap-3">
        <Image
          src="/assets/us-flag.png"
          alt="United States"
          width={30}
          height={20}
          className="h-auto w-6 object-contain"
        />

        <span className="font-heading text-primary text-[13px] font-medium whitespace-nowrap sm:text-sm">
          U.S. Manufacturing &amp; Fulfillment
        </span>
      </div>

      {/* GOLD SEPARATOR */}
      <span
        aria-hidden="true"
        className="bg-gold inline-flex h-[7px] w-[7px] shrink-0 rotate-45 shadow-[0_0_8px_rgba(228,166,12,0.35)]"
      />

      {/* SECOND MESSAGE */}
      <span className="font-heading text-primary shrink-0 text-[13px] font-medium whitespace-nowrap sm:text-sm">
        Third-Party Tested with COAs
      </span>

      {/* GOLD SEPARATOR */}
      <span
        aria-hidden="true"
        className="bg-gold inline-flex h-[7px] w-[7px] shrink-0 rotate-45 shadow-[0_0_8px_rgba(228,166,12,0.35)]"
      />

      {/* THIRD MESSAGE */}
      <span className="font-heading text-primary shrink-0 text-[13px] font-medium whitespace-nowrap sm:text-sm">
        Research Use Only (RUO)
      </span>

      {/* GOLD SEPARATOR */}
      <span
        aria-hidden="true"
        className="bg-gold inline-flex h-[7px] w-[7px] shrink-0 rotate-45 shadow-[0_0_8px_rgba(228,166,12,0.35)]"
      />

      {/* SHOP NOW BUTTON */}
      <Link
        href="/shop"
        className="announcement-shop-btn group text-primary-dark relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full px-3.5 py-1.5 font-sans text-sm font-medium shadow-md"
      >
        <span className="relative z-10">Shop Now</span>

        <ArrowRight
          size={17}
          className="relative z-10 transition-transform duration-500 ease-out group-hover:translate-x-1"
        />
      </Link>
    </div>
  );
}

function AnnouncementBar() {
  return (
    <section
      aria-label="Spectrum announcements"
      className="relative isolate overflow-hidden bg-[#F0E1F4] py-2.5"
    >
      {/* BACKGROUND GRADIENT */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#F7EAF9,#EAD6F0,#F7EAF9)]" />

      {/* MOBILE + TABLET: MARQUEE */}
      <div className="relative z-10 lg:hidden">
        <Marquee
          speed={35}
          gradient={false}
          pauseOnHover
          pauseOnClick
          autoFill
          direction="left"
        >
          <AnnouncementContent />
        </Marquee>
      </div>

      {/* DESKTOP: STATIC */}
      <div className="relative z-10 mx-auto hidden w-full max-w-7xl items-center justify-center px-8 lg:flex">
        <AnnouncementContent />
      </div>

      <style jsx global>{`
        /* =========================================
           PREMIUM GOLD BUTTON
        ========================================= */

        .announcement-shop-btn {
          isolation: isolate;

          background: linear-gradient(
            110deg,
            #e4a60c 0%,
            #ffdc78 45%,
            #e4a60c 100%
          );

          transition:
            transform 400ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 400ms ease;
        }

        /* SMOOTH HOVER GRADIENT */
        .announcement-shop-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;

          background: linear-gradient(
            110deg,
            #ffe49a 0%,
            #e4a60c 45%,
            #ffd15c 100%
          );

          opacity: 0;
          transition: opacity 500ms ease;
        }

        .announcement-shop-btn:hover::before {
          opacity: 1;
        }

        .announcement-shop-btn:hover {
          transform: translateY(-2px);

          box-shadow:
            0 6px 18px rgba(228, 166, 12, 0.3),
            0 0 14px rgba(228, 166, 12, 0.15);
        }

        .announcement-shop-btn:focus-visible {
          outline: 2px solid #55205f;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .announcement-shop-btn,
          .announcement-shop-btn::before,
          .announcement-shop-btn svg {
            transition: none;
          }

          .announcement-shop-btn:hover {
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}

function MobileSidebar({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[100] lg:hidden ${
        open ? "visible" : "invisible delay-300"
      }`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        id="mobile-navigation"
        aria-label="Mobile navigation"
        inert={!open}
        className={`absolute inset-y-0 right-0 flex w-[min(340px,90vw)] flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#EEE6EF] px-5 py-4">
          <Link href="/" onClick={onClose} aria-label="Spectrum home">
            <Image
              src="/assets/spectrum-logo.png"
              alt="Spectrum Biosciences"
              width={160}
              height={55}
              className="h-10 w-auto object-contain"
            />
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-primary hover:bg-primary flex size-9 items-center justify-center rounded-full bg-[#F6E5F7] transition-colors hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          aria-label="Sidebar navigation"
          className="flex-1 overflow-y-auto px-4 py-5"
        >
          <p className="mb-3 px-3 text-[11px] font-bold tracking-[0.12em] text-[#9B8C9F] uppercase">
            Navigation
          </p>

          <div className="space-y-1">
            {navLinks.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(`${link.href}/`));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-xl px-4 py-3.5 font-sans text-sm font-semibold transition-colors ${
                    active
                      ? "text-primary bg-[#F6E5F7]"
                      : "hover:text-primary text-[#514653] hover:bg-[#FAF5FB]"
                  }`}
                >
                  {link.name}
                  <ChevronRight
                    size={17}
                    className={active ? "text-primary" : "text-[#B6A7BA]"}
                  />
                </Link>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[#EEE6EF] pt-5">
            <p className="mb-3 px-3 text-[11px] font-bold tracking-[0.12em] text-[#9B8C9F] uppercase">
              Account
            </p>

            <Link
              href="/account"
              onClick={onClose}
              className="hover:text-primary flex items-center gap-3 rounded-xl px-4 py-3.5 text-[14px] font-semibold text-[#514653] transition-colors hover:bg-[#FAF5FB]"
            >
              <UserRound size={19} />
              My Account
              <ChevronRight size={17} className="ml-auto text-[#B6A7BA]" />
            </Link>
          </div>
        </nav>

        <div className="border-t border-[#EEE6EF] px-5 py-4">
          <p className="flex items-center gap-2 text-[11px] text-[#8B7E8E]">
            <FlaskConical size={15} className="text-primary" />
            For laboratory research use only
          </p>
        </div>
      </aside>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { openCart, itemCount, hydrated } = useCart();

  const cartCount = hydrated ? itemCount : 0;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  return (
    <>
      <AnnouncementBar />

      <header
        className={`border-primary/10 sticky top-0 z-50 w-full border-b bg-[#f6e8ff] backdrop-blur-xl transition-shadow duration-500 ${
          scrolled ? "shadow-[0_8px_30px_rgba(45,0,50,0.08)]" : ""
        }`}
      >
        <div
          className={`mx-auto grid max-w-[1360px] grid-cols-[1fr_auto] items-center gap-4 px-4 transition-[padding] duration-300 ease-in-out sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-10 ${
            scrolled ? "py-1" : "py-2"
          }`}
        >
          <Link
            href="/"
            aria-label="Spectrum Biosciences home"
            className="flex shrink-0 items-center"
          >
            <Image
              src="/assets/spectrum-logo.png"
              alt="Spectrum Biosciences"
              width={200}
              height={65}
              priority
              className={`w-auto origin-left object-contain transition-[height] duration-300 ease-in-out ${
                scrolled
                  ? "h-[44px] sm:h-[47px] lg:h-[48px]"
                  : "h-[48px] sm:h-[51px] lg:h-[54px]"
              }`}
            />
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center justify-center gap-7 lg:flex xl:gap-10"
          >
            {navLinks.map((link) => {
              const active = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`group text-md relative font-sans font-medium whitespace-nowrap transition-colors duration-300 ${
                    active
                      ? "text-primary"
                      : "hover:text-primary text-[#514654]"
                  }`}
                >
                  {link.name}

                  <span
                    className={`bg-gold absolute -bottom-2 left-0 h-[2px] rounded-full transition-all duration-300 ${
                      active ? "w-full" : "w-0 group-hover:w-full"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
              type="button"
              data-header-search-trigger
              onClick={() => {
                setSearchOpen((current) => !current);
                setMenuOpen(false);
              }}
              aria-label={searchOpen ? "Close search" : "Open search"}
              aria-expanded={searchOpen}
              aria-controls="header-search"
              className="text-primary relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[#F6E5F7] sm:h-11 sm:w-11"
            >
              {searchOpen ? <X size={21} /> : <Search size={21} />}
            </button>

            <Link
              href="/account"
              aria-label="My account"
              className="text-primary hidden h-11 w-11 items-center justify-center rounded-full transition-all duration-300 hover:bg-[#F6E5F7] lg:flex"
            >
              <UserRound size={21} />
            </Link>

            <button
              type="button"
              onClick={openCart}
              aria-label={`Open shopping cart, ${cartCount} items`}
              className="text-primary relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[#F6E5F7] sm:h-11 sm:w-11"
            >
              <ShoppingBag size={21} strokeWidth={1.8} />

              {cartCount > 0 && (
                <span className="bg-gold absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-sans text-[10px] font-bold text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(true);
                setSearchOpen(false);
              }}
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              className="text-primary flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:bg-[#F6E5F7] sm:h-11 sm:w-11 lg:hidden"
            >
              <Menu size={24} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <HeaderSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </header>

      <MobileSidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pathname={pathname}
      />

      <style jsx global>{`
        @keyframes spectrum-announcement-scroll {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        .announcement-track {
          animation: spectrum-announcement-scroll 45s linear infinite;
          will-change: transform;
        }

        @media (max-width: 640px) {
          .announcement-track {
            animation-duration: 35s;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .announcement-track {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
