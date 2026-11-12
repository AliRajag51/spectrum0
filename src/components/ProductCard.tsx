"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import {
  ArrowUpRight,
  Eye,
  FlaskConical,
  ShoppingBag,
  Check,
} from "lucide-react";

import { useCart } from "@/context/CartContext";
import { formatMoney, type StorefrontProduct } from "@/lib/storefront";

type ProductCardProps = {
  product: StorefrontProduct;
  onQuickView?: (product: StorefrontProduct) => void;
};

export default function ProductCard({
  product,
  onQuickView,
}: ProductCardProps) {
  const [selectedVariant, setSelectedVariant] = useState(
    product.defaultVariant ?? 0,
  );

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const { addItem } = useCart();

  const variant = product.variants[selectedVariant];

  const inStock = variant?.inStock !== false;

  const price =
    variant?.price != null && Number.isFinite(variant.price)
      ? variant.price
      : null;
  const hasPrice = price != null;

  const canAdd = Boolean(variant && inStock && hasPrice);

  const handleAddToCart = async () => {
    if (!canAdd || adding || !variant) return;

    try {
      setAdding(true);
      setError("");

      // Adds one bottle of the selected strength.
      // CartContext automatically opens CartDrawer.
      const added = await addItem(product, variant, 1);
      if (!added) setError("Unable to add to cart.");
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to add to cart.",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="group hover:border-primary/20 relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#EEE5EF] bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(85,32,95,0.1)]">
      {/* PRODUCT IMAGE */}

      <div className="relative aspect-square overflow-hidden bg-[#F8EFF9]">
        <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#E9C6EE]/50 blur-[65px]" />

        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-white/80 blur-[65px]" />

        {/* QUICK VIEW */}

        <button
          type="button"
          onClick={() => onQuickView?.(product)}
          aria-label={`Quick view ${product.name}`}
          className="text-primary hover:bg-primary absolute top-2 right-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-110 hover:text-white sm:top-4 sm:right-4 sm:h-11 sm:w-11"
        >
          <Eye size={17} strokeWidth={1.7} className="sm:h-5 sm:w-5" />
        </button>

        {/* IMAGE LINK */}

        <Link
          href={`/products/${product.slug}`}
          aria-label={`View ${product.name}`}
          className="relative flex h-full w-full items-center justify-center"
        >
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="border-primary/10 flex h-24 w-24 items-center justify-center rounded-[28px] border bg-white/60">
                <FlaskConical
                  size={42}
                  strokeWidth={1.1}
                  className="text-primary/45"
                />
              </div>

              <span className="text-primary/40 font-sans text-[11px] font-medium tracking-[0.15em] uppercase">
                Spectrum Biosciences
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* PRODUCT INFORMATION */}

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* TITLE */}

        <Link href={`/products/${product.slug}`} className="group/title">
          <h3 className="font-heading text-primary text-[16px] leading-[1.35] font-semibold tracking-[-0.04em] transition-colors sm:text-[18px]">
            {product.name}
          </h3>
        </Link>

        <div className="mt-auto pt-4">
          {/* VARIANT SELECTOR */}

          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto sm:gap-2">
            {product.variants.map((item, index) => {
              const selected = selectedVariant === index;
              const unavailable = item.inStock === false;

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={unavailable}
                  onClick={() => {
                    setSelectedVariant(index);
                    setError("");
                  }}
                  aria-pressed={selected}
                  className={`min-h-8 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-all duration-300 sm:min-h-9 sm:px-3.5 sm:py-1.5 sm:text-[12px] ${
                    selected
                      ? "border-primary bg-primary text-white"
                      : "text-primary hover:border-primary border-[#E7DCE9] bg-[#FAF7FB]"
                  } ${unavailable ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* PRICE */}

          <div className="mt-3 flex items-center justify-between border-t border-[#F0E8F1] pt-3">
            <div>
              <p className="font-heading text-primary text-[20px] font-bold tracking-tight">
                {price != null ? formatMoney(price) : "Price pending"}
              </p>
            </div>
          </div>

          {/* ADD TO CART */}

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canAdd || adding}
            className="btn-gradient mt-2 w-full"
          >
            <span>
              {!inStock
                ? "Out of Stock"
                : !hasPrice
                  ? "Unavailable"
                  : adding
                    ? "Adding..."
                    : "Add to Cart"}
            </span>
            {canAdd && <ArrowUpRight size={15} className="shrink-0" />}
          </button>

          {/* ERROR MESSAGE */}

          {error && (
            <p role="alert" className="mt-3 font-sans text-[11px] text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
