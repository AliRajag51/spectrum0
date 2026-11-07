"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct } from "@/lib/storefront";
import ShopHero from "../ShopHero";
import ProductCard from "../ProductCard";

import QuickView from "../QuickView";
import CustomSelect from "../CustomSelect";

export default function ShopClient({ initialSearch = "" }: { initialSearch?: string }) {
  const catalog = useProducts();
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState("All Products");
  const [sort, setSort] = useState("featured");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = catalog.filter((product) => {
      if (category !== "All Products" && product.category !== category)
        return false;
      if (!term) return true;
      const text = [
        product.name,
        product.slug,
        product.category,
        product.description,
        ...product.variants.map((item) => item.label),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
    if (sort === "name") matches.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price-low" || sort === "price-high") {
      const price = (product: StorefrontProduct) =>
        product.variants[product.defaultVariant]?.price ?? Infinity;
      matches.sort((a, b) =>
        sort === "price-low" ? price(a) - price(b) : price(b) - price(a),
      );
    }
    return matches;
  }, [catalog, search, category, sort]);

  return (
    <main className="min-h-screen">
      <header>
        <ShopHero />
      </header>

      <section
        id="shop-products"
        aria-label="Shop products"
        className="relative px-4 py-10 sm:px-6 lg:px-10"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex min-w-0 flex-col gap-3 border-b border-[#EEE6EF] pb-6 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative w-full min-w-0 sm:flex-1 lg:max-w-[390px]">
              <Search
                size={17}
                className="text-primary/60 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 sm:left-4"
              />

              <label htmlFor="shop-search" className="sr-only">
                Search products
              </label>

              <input
                id="shop-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products..."
                className="focus:border-primary h-11 w-full min-w-0 rounded-2xl border border-[#E8DCEA] bg-white pr-9 pl-9 text-[12px] text-[#29232D] outline-none placeholder:text-[#A69BA9] sm:h-12 sm:pl-11 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="text-primary absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full hover:bg-[#F6E5F7]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <CustomSelect
              id="shop-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              placeholder="Sort products"
             className="w-full sm:w-[190px] sm:shrink-0 lg:ml-auto"
              options={[
                { value: "featured", label: "Featured" },
                { value: "name", label: "Name A–Z" },
                { value: "price-low", label: "Price: Low to High" },
                { value: "price-high", label: "Price: High to Low" },
              ]}
            />
          </div>

          {filtered.length ? (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onQuickView={setQuickViewProduct}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <Search size={30} className="text-primary/35" />

              <h2 className="font-heading text-primary mt-4 text-xl font-bold">
                No matching products
              </h2>

              <p className="mt-2 text-sm text-[#817586]">
                Try another search or category.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory("All Products");
                }}
                className="bg-primary mt-5 rounded-full px-5 py-3 text-xs font-semibold text-white"
              >
                Clear filters
              </button>
            </div>
          )}

          <p className="mt-12 border-t border-[#EEE6EF] pt-5 text-xs text-[#817586]">
            All products are intended for scientific and laboratory research
            only. Not for human or veterinary use.
          </p>
        </div>
      </section>
      {quickViewProduct && (
        <QuickView
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </main>
  );
}
