"use client";

import { useState } from "react";
import { ArrowDown, Check } from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct } from "@/lib/storefront";
import ProductCard from "./ProductCard";
import QuickView from "./QuickView";

const PRODUCTS_PER_PAGE = 8;

export default function ProductGrid() {
  const [quickViewProduct, setQuickViewProduct] =
    useState<StorefrontProduct | null>(null);
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
            <p className="text-gold mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
              Explore The Collection
            </p>
            <h2 className="section-heading mt-2">Precision in Every Vial.</h2>
            <div
              aria-hidden="true"
              className="my-2 h-[3px] w-28 rounded-full bg-linear-to-r from-[#A87516] via-[#FFE49A] to-[#E4A60C] shadow-[0_0_10px_rgba(228,166,12,0.2)]"
            />
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
              className="btn-gradient mt-6"
            >
              Load More Products
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
