"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import { formatCartMoney, useCart } from "@/context/CartContext";

export default function CartSuggestions() {
  const { items, addItem, busy } = useCart();
  const products = useProducts();
  const inCart = new Set(items.map((item) => item.productId));
  const suggestions = products
    .filter((product) => !inCart.has(product.id))
    .slice(0, 4);

  if (!suggestions.length)
    return (
      <p className="text-xs leading-relaxed text-[#8090a4]">
        Your selected research products will appear here.
      </p>
    );

  return (
    <div className="flex flex-col gap-2.5">
      {suggestions.map((product) => {
        const variant =
          product.variants?.[product.defaultVariant] || product.variants?.[0];
        if (!variant) return null;
        const available = variant.inStock && variant.price !== null;
        return (
          <article
            key={product.id}
            className="rounded-2xl border border-[#e3ebf3] bg-white p-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="relative size-12 shrink-0 rounded-xl bg-[#edf5fe]">
                {product.image && (
                  <Image
                    src={product.image}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover rounded-xl"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#0b1b3f]">
                  {product.name}
                </p>
                <p className="text-[10px] text-[#7e91a9]">{variant.label}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#0b1b3f]">
                  {variant.price !== null ? formatCartMoney(variant.price) : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!available || busy}
              onClick={() => void addItem(product, variant, 1)}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b1b3f] text-[11px] font-semibold text-white transition-colors hover:bg-[#2463a9] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={13} /> {available ? "Add" : "Unavailable"}
            </button>
          </article>
        );
      })}
    </div>
  );
}