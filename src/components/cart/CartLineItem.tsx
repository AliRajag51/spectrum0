"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  formatCartMoney,
  useCart,
  type CartItem,
} from "@/context/CartContext";

export default function CartLineItem({
  item,
  onNavigate,
}: {
  item: CartItem;
  onNavigate?: () => void;
}) {
  const { updateQuantity, removeItem, busy } = useCart();
  // WooCommerce caps a line at 99; stock is checked by WooCommerce on update.
  const canIncrease = item.quantity < 99;
  return (
    <article className="flex gap-3 border-b border-[#e5edf5] py-4 last:border-b-0">
      <Link
        href={`/products/${item.slug}`}
        onClick={onNavigate}
        className="relative size-[83px] shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-[#edf5fd] sm:size-[96px]"
        aria-label={`View ${item.name}`}
      >
        {item.image && (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="96px"
            className="object-cover"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/products/${item.slug}`}
              onClick={onNavigate}
              className="font-heading text-[15px] font-bold text-[#0b1b3f] hover:text-[#347ec8]"
            >
              {item.name}
            </Link>
            <p className="mt-1 text-xs text-[#788aa0]">{item.variantLabel}</p>
          </div>
          <span className="shrink-0 text-[13px] font-bold text-[#0b1b3f]">
            {formatCartMoney(item.lineTotal)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex h-9 items-center overflow-hidden rounded-full border border-[#dce7f1] bg-white">
            <button
              type="button"
              aria-label={`Decrease ${item.name} quantity`}
              disabled={busy}
              onClick={() => updateQuantity(item.key, item.quantity - 1)}
              className="grid size-9 place-items-center text-[#0b1b3f] hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span
              className="min-w-6 text-center text-xs font-semibold text-[#0b1b3f]"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase ${item.name} quantity`}
              disabled={busy || !canIncrease}
              onClick={() => updateQuantity(item.key, item.quantity + 1)}
              className="grid size-9 place-items-center text-[#0b1b3f] hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => removeItem(item.key)}
            className="inline-flex items-center gap-1 text-[11px] text-[#8c9aac] underline-offset-2 hover:text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}
