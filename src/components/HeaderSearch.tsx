"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowRight,
  ArrowUpRight,
  Search,
  X,
  PackageSearch,
  FlaskConical,
  TrendingUp,
} from "lucide-react";

import { useProducts } from "@/components/providers/ProductsProvider";
import { formatMoney, type StorefrontProduct } from "@/lib/storefront";

type HeaderSearchProps = {
  open: boolean;
  onClose?: () => void;
};

type ScoredProduct = StorefrontProduct & { searchScore: number };

export default function HeaderSearch({ open, onClose }: HeaderSearchProps) {
  const router = useRouter();

  const [query, setQuery] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ==============================================
     AVAILABLE PRODUCTS
  ============================================== */

  const availableProducts = useProducts();

  /* ==============================================
     SEARCH RESULTS
  ============================================== */

  const searchResults = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return [];

    return availableProducts
      .map((product) => {
        const name = product.name.toLowerCase();
        const slug = product.slug.toLowerCase();

        const searchableText = [
          product.name,
          product.slug,
          product.category,
          product.description,
          product.badge,
          ...product.variants.map((variant) => variant.label),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(search)) return null;

        // Prioritize exact and partial product-name matches.
        const score =
          name === search
            ? 100
            : name.startsWith(search)
              ? 80
              : name.includes(search)
                ? 60
                : slug.includes(search)
                  ? 40
                  : 20;

        return {
          ...product,
          searchScore: score,
        };
      })
      .filter((product): product is ScoredProduct => product !== null)
      .sort((a, b) => b.searchScore - a.searchScore)
      .slice(0, 6);
  }, [query, availableProducts]);

  /* ==============================================
     SUGGESTED PRODUCTS
  ============================================== */

  const suggestedProducts = useMemo(() => {
    const featured = availableProducts.filter((product) =>
      /featured|best.?sell|popular/i.test(product.badge || ""),
    );

    return (featured.length ? featured : availableProducts).slice(0, 2);
  }, [availableProducts]);

  /* ==============================================
     CLOSE SEARCH
  ============================================== */

  const closeSearch = () => {
    setQuery("");
    onClose?.();
  };

  /* ==============================================
     FOCUS ON OPEN
  ============================================== */

  useEffect(() => {
    if (!open) return;

    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeout);
  }, [open]);

  /* ==============================================
     CLICK OUTSIDE / ESCAPE
  ============================================== */

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      // The header search trigger has its own toggle handler.
      if (target.closest("[data-header-search-trigger]")) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose?.();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSearch();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  /* ==============================================
     SUBMIT SEARCH
  ============================================== */

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!query.trim()) return;

    // Only navigate when an actual matching product exists.
    const firstMatch = searchResults[0];

    if (!firstMatch) return;

    router.push(`/products/${firstMatch.slug}`);

    closeSearch();
  };

  /* ==============================================
     PRODUCT RESULT
  ============================================== */

  const ProductResult = ({ product }: { product: StorefrontProduct }) => {
    const variants = product.variants;

    const variant = variants[product.defaultVariant] ?? variants[0];

    const inStock = variant?.inStock !== false;

    return (
      <Link
        href={`/products/${product.slug}`}
        onClick={closeSearch}
        className="group flex items-center gap-3 rounded-[15px] px-3 py-3 transition-all duration-300 hover:bg-[#F9F3FA] sm:gap-4"
      >
        {/* IMAGE */}

        <div className="relative h-[65px] w-[65px] shrink-0 overflow-hidden rounded-[13px] bg-[#F6EDF8] sm:h-[75px] sm:w-[75px]">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="75px"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FlaskConical size={25} className="text-primary/30" />
            </div>
          )}
        </div>

        {/* PRODUCT INFORMATION */}

        <div className="min-w-0 flex-1">
          <span className="text-secondary font-sans text-[9px] font-bold tracking-[0.12em] uppercase">
            {product.category || "Research Compound"}
          </span>

          <h3 className="font-heading text-primary group-hover:text-secondary mt-1 truncate text-[14px] font-bold tracking-[-0.03em] transition-colors sm:text-[16px]">
            {product.name}
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {variant?.label && (
              <span className="text-primary rounded-full bg-[#F3E5F5] px-2 py-1 font-sans text-[10px] font-semibold">
                {variant.label}
              </span>
            )}

            <span
              className={`flex items-center gap-1.5 font-sans text-[10px] font-semibold ${
                inStock ? "text-emerald-600" : "text-red-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  inStock ? "bg-emerald-500" : "bg-red-500"
                }`}
              />

              {inStock ? "In Stock" : "Out of Stock"}
            </span>
          </div>
        </div>

        {/* PRICE */}

        <div className="flex shrink-0 items-center gap-3">
          {variant?.price != null && (
            <span className="font-heading text-primary text-[14px] font-bold sm:text-[17px]">
              {formatMoney(variant.price)}
            </span>
          )}

          <span className="text-primary group-hover:bg-primary hidden h-9 w-9 items-center justify-center rounded-full bg-[#F6E5F7] transition-all duration-300 group-hover:rotate-45 group-hover:text-white sm:flex">
            <ArrowUpRight size={17} />
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div
      ref={panelRef}
      id="header-search"
      role="region"
      aria-label="Product search"
      aria-hidden={!open}
      inert={!open}
      className={`border-primary/10 absolute top-full right-0 left-0 z-[100] border-b bg-white shadow-[0_25px_55px_rgba(85,32,95,0.12)] transition-all duration-300 ease-out ${
        open
          ? "visible translate-y-0 opacity-100"
          : "invisible -translate-y-3 opacity-0"
      }`}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
        {/* ==========================================
            SEARCH INPUT
        ========================================== */}

        <form
          onSubmit={handleSearch}
          role="search"
          className="mx-auto flex max-w-3xl items-center gap-3 py-6 sm:py-8"
        >
          <Search
            size={22}
            strokeWidth={1.8}
            className="text-primary shrink-0"
          />

          <label htmlFor="product-search" className="sr-only">
            Search research products
          </label>

          <input
            ref={inputRef}
            id="product-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search research products..."
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-sans text-[14px] font-medium text-[#29232D] outline-none placeholder:text-[#A49AA6] sm:text-[17px] [&::-webkit-search-cancel-button]:hidden"
          />

          {/* CLEAR */}

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="hover:text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9B8D9E] transition-colors hover:bg-[#F6E5F7]"
            >
              <X size={18} />
            </button>
          )}

          {/* SEARCH BUTTON */}

          <button
            type="submit"
            disabled={!query.trim() || searchResults.length === 0}
            aria-label={
              searchResults.length > 0
                ? `View ${searchResults[0].name}`
                : "No matching product"
            }
            className="bg-primary hover:bg-secondary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-all duration-300 hover:rotate-45 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:rotate-0"
          >
            <ArrowRight size={19} />
          </button>
        </form>

        {/* ==========================================
            RESULTS / SUGGESTIONS
        ========================================== */}

        <div className="mx-auto max-w-3xl border-t border-[#F0E8F1]">
          {/* NO QUERY: FEATURED SUGGESTIONS */}

          {!query.trim() && (
            <div className="py-5">
              <div className="max-h-[350px] overflow-y-auto pb-4">
                {suggestedProducts.map((product) => (
                  <ProductResult key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}

          {/* QUERY: MATCHED PRODUCTS */}

          {query.trim() && (
            <div className="py-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search size={15} className="text-secondary" />

                  <h2 className="font-sans text-[11px] font-bold tracking-[0.13em] text-[#756B78] uppercase">
                    Search Results
                  </h2>
                </div>

                <span className="font-sans text-[11px] text-[#9C8FA0]">
                  {searchResults.length}{" "}
                  {searchResults.length === 1 ? "result" : "results"}
                </span>
              </div>

              {searchResults.length > 0 ? (
                <>
                  <div className="max-h-[380px] overflow-y-auto pb-4">
                    {searchResults.map((product) => (
                      <ProductResult key={product.id} product={product} />
                    ))}
                  </div>
                </>
              ) : (
                /* NO RESULTS */

                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-primary flex h-14 w-14 items-center justify-center rounded-full bg-[#F6E5F7]">
                    <PackageSearch size={26} strokeWidth={1.5} />
                  </span>

                  <h3 className="font-heading mt-4 text-[19px] font-bold text-[#29232D]">
                    No products found
                  </h3>

                  <p className="mt-2 max-w-[310px] font-sans text-[12px] leading-relaxed text-[#827789]">
                    We couldn't find a matching product. Try another compound
                    name, category, or strength.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    className="text-primary hover:text-secondary mt-4 font-sans text-[12px] font-bold underline underline-offset-4"
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
