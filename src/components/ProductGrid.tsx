"use client";

import { useState } from "react";
import { ArrowDown, Check } from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct } from "@/lib/storefront";
import ProductCard from "./ProductCard";
import QuickView from "./QuickView";

const PRODUCTS_PER_PAGE = 8;

export default function ProductGrid() {
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_PAGE);

  const activeProducts = useProducts();

  const visibleProducts = activeProducts.slice(0, visibleCount);
  const totalProducts = activeProducts.length;
  const hasMore = visibleCount < totalProducts;

  const loadMore = () => {
    setVisibleCount((prev) =>
      Math.min(prev + PRODUCTS_PER_PAGE, totalProducts),
    );
  };

  return (
    <section id="shop" className="bg-white px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-secondary mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
              Explore The Collection
            </p>
            <h2 className="section-heading mt-2">Precision in Every Vial.</h2>
            <p className="text-muted text-md mt-2 max-w-xl font-sans">
              Discover the Spectrum Biosciences research collection.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickView={setQuickViewProduct}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-col items-center">
          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              className="group border-primary bg-primary hover:bg-primary-dark mt-7 inline-flex items-center gap-5 rounded-full border px-7 py-3.5 font-sans text-sm font-semibold text-white transition-all duration-300 hover:shadow-[0_12px_30px_rgba(85,32,95,0.2)]"
            >
              Load More Products
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-y-1">
                <ArrowDown size={18} strokeWidth={1.8} />
              </span>
            </button>
          ) : (
            <div className="bg-accent-light text-primary mt-7 flex items-center gap-2 rounded-full px-5 py-3 font-sans text-sm font-semibold">
              <Check size={17} />
              You've viewed all products
            </div>
          )}
        </div>
      </div>

      {quickViewProduct && (
        <QuickView
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </section>
  );
}
