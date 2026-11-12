"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  FlaskConical,
  Minus,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import {
  PACK_OPTIONS,
  getPackPrice,
  formatMoney,
} from "@/data/product-detail-config";
import type { StorefrontProduct } from "@/lib/storefront";

type QuickViewProps = {
  product: StorefrontProduct;
  onClose: () => void;
};

export default function QuickView({ product, onClose }: QuickViewProps) {
  const { addItem } = useCart();
  const [cartError, setCartError] = useState("");
  const titleId = useId();
  const [selectedVariant, setSelectedVariant] = useState(
    product.defaultVariant ?? 0,
  );
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);

  const variant = product.variants[selectedVariant];

  const pack = PACK_OPTIONS.find((item) => item.quantity === selectedPack);
  const packSize = pack?.quantity ?? 1;

  const hasPrice = variant?.price != null;
  const unitPrice = variant?.price ?? 0;

  const bundleActive = Boolean(pack && quantity >= packSize);
  const discount = bundleActive && pack ? pack.discountPercent : 0;

  const extraBottles = bundleActive ? quantity - packSize : 0;

  const totalPrice = bundleActive
    ? Math.round(
        (getPackPrice(unitPrice, packSize, discount) +
          extraBottles * unitPrice) *
          100,
      ) / 100
    : Math.round(quantity * unitPrice * 100) / 100;

  /* The catalogue carries an in/out flag, not a count, so quantity is only
     capped by the cart itself. */
  const stock = Infinity;

  const inStock = variant?.inStock !== false;

  const canAdd =
    hasPrice && Number.isFinite(unitPrice) && unitPrice >= 0 && inStock;

  useEffect(() => {
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
  }, [onClose]);

  useEffect(() => {
    setQuantity(packSize);
  }, [selectedVariant, packSize]);

  const handleAddToCart = async () => {
    if (!canAdd || !variant) return;

    try {
      setCartError("");

      let added: boolean;
      if (bundleActive) {
        added = await addItem(product, variant, 1, { packSize });

        if (added && extraBottles > 0) {
          added = await addItem(product, variant, extraBottles, {
            packSize: 1,
          });
        }
      } else {
        added = await addItem(product, variant, quantity, { packSize: 1 });
      }

      if (!added) {
        setCartError("Unable to add product to cart.");
        return;
      }

      onClose();
    } catch (error) {
      setCartError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to add product to cart.",
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1B1020]/65 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[95dvh] w-full max-w-[1040px] overflow-y-auto rounded-[22px] bg-white p-3 shadow-2xl sm:p-4 lg:rounded-[26px]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick view"
          className="text-primary hover:bg-primary absolute top-3 right-3 z-30 flex size-10 items-center justify-center rounded-full bg-[#F7F3F8] shadow-sm transition-all duration-300 hover:text-white sm:top-4 sm:right-4"
        >
          <X size={20} />
        </button>

        <div className="grid gap-4 md:grid-cols-[40%_minmax(0,1fr)]">
          <div className="relative flex min-h-[260px] flex-col overflow-hidden rounded-[20px] border border-[#EEE7F0] bg-[#FBF9FC] sm:min-h-[340px] md:min-h-[440px]">
            <div className="relative flex flex-1 items-center justify-center p-5 sm:p-8">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 450px"
                  className="object-cover"
                />
              ) : (
                <FlaskConical
                  size={85}
                  strokeWidth={1}
                  className="text-primary/30"
                />
              )}
            </div>

            <div className="absolute bottom-4 left-4 z-10">
              <span className="text-primary inline-flex items-center gap-2 rounded-full border border-[#E8DEEA] bg-white px-3 py-2 font-sans text-[10px] font-semibold tracking-wider uppercase">
                <FlaskConical size={14} />
                Research Use Only
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col rounded-[20px] p-3 sm:p-4 md:p-5">
            <div className="pr-10">
              <h2
                id={titleId}
                className="font-heading text-primary mt-1 text-[25px] leading-[1.1] font-bold tracking-[-0.05em] sm:text-[30px]"
              >
                {product.name}
              </h2>
            </div>

            <div className="my-4 h-px w-full bg-[#F0EAF1]" />

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted w-[70px] shrink-0 font-sans text-xs font-semibold tracking-[0.12em] uppercase">
                Strength
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {product.variants.map((item, index) => {
                  const selected = selectedVariant === index;

                  return (
                    <button
                      key={item.id || index}
                      type="button"
                      disabled={item.inStock === false}
                      onClick={() => setSelectedVariant(index)}
                      aria-pressed={selected}
                      className={`inline-flex min-h-9 items-center justify-center rounded-full border px-4 py-1.5 font-sans text-[12px] font-semibold whitespace-nowrap transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px] ${
                        selected
                          ? "border-primary bg-primary text-white"
                          : "text-primary hover:border-primary border-[#E8DFEA] bg-white hover:bg-[#F8EFF9]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="my-4 h-px w-full bg-[#F0EAF1]" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-sans text-xs font-semibold tracking-[0.12em] text-[#817586] uppercase">
                Bundle & Save
              </h3>

              <span className="text-gold rounded-full bg-[#fffde5] px-3 py-1.5 font-sans text-[10px] font-bold">
                Up to 15% OFF
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {PACK_OPTIONS.map((item) => {
                const selected = selectedPack === item.quantity;

                const price = getPackPrice(
                  unitPrice,
                  item.quantity,
                  item.discountPercent,
                );

                const bottleCount = item.quantity === 2 ? 2 : 3;
                const bottleWidth = bottleCount === 2 ? 26 : 23;
                const stepX = bottleCount === 2 ? 12 : 10;

                return (
                  <button
                    key={item.quantity}
                    type="button"
                    onClick={() =>
                      setSelectedPack(selected ? null : item.quantity)
                    }
                    aria-pressed={selected}
                    disabled={
                      variant?.inStock === false || item.quantity > stock
                    }
                    className={`group flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 ${
                      selected
                        ? "border-primary bg-[#F8EFF9]"
                        : "hover:border-primary/40 border-[#EAE3EB] bg-white"
                    }`}
                  >
                    {/* BOTTLE IMAGES */}
                    <div className="relative h-[75px] w-[85px] shrink-0 sm:h-[90px] sm:w-[100px]">
                      {Array.from({ length: bottleCount }).map((_, index) => {
                        const bottleWidth = 38;
                        const bottleHeight = 75;
                        const stepX = 17;

                        const groupWidth =
                          bottleWidth + (bottleCount - 1) * stepX;

                        return (
                          <div
                            key={index}
                            className="absolute bottom-0"
                            style={{
                              width: `${bottleWidth}px`,
                              height: `${bottleHeight}px`,
                              left: `calc(50% - ${groupWidth / 2}px + ${index * stepX}px)`,
                              zIndex: bottleCount - index,
                            }}
                          >
                            <Image
                              src="/assets/cta-2.png"
                              alt=""
                              fill
                              sizes="38px"
                              className="object-contain drop-shadow-[0_3px_3px_rgba(45,15,55,0.12)] transition-transform duration-300 group-hover:-translate-y-0.5"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* BUNDLE DETAILS */}
                    <div className="flex flex-col items-center gap-1">
                      <p className="font-heading text-primary text-sm leading-tight font-semibold whitespace-nowrap">
                        {item.quantity} Vials
                      </p>

                      <p className="text-xs font-bold whitespace-nowrap text-emerald-600">
                        {item.discountPercent}% OFF
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-5">
              <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
                <div className="flex h-11 shrink-0 items-center rounded-full border border-[#E8DFEA] px-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className="text-primary flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30"
                  >
                    <Minus size={15} />
                  </button>

                  <span className="text-primary w-7 text-center text-sm font-semibold">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                    disabled={variant?.inStock === false || quantity >= stock}
                    aria-label="Increase quantity"
                    className="text-primary flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!canAdd}
                  className="btn-gradient w-full"
                >
                  <span>
                    {!inStock
                      ? "Out of Stock"
                      : !hasPrice
                        ? "Unavailable"
                        : "Add to Cart"}
                  </span>

                  <ArrowRight size={15} className="hidden shrink-0 md:block" />
                </button>

                <div className="shrink-0 text-right">
                  <span className="font-heading text-primary text-[16px] font-bold tracking-tight whitespace-nowrap sm:text-[21px]">
                    {hasPrice ? formatMoney(totalPrice) : "—"}
                  </span>
                </div>
              </div>

              {cartError && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {cartError}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
