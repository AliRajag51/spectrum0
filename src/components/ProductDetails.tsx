"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Download, ExternalLink, FileText } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileCheck2,
  FlaskConical,
  Headphones,
  LockKeyhole,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Truck,
  ZoomIn,
  X,
} from "lucide-react";
import {
  PACK_OPTIONS,
  getPackPrice,
  formatMoney,
} from "@/data/product-detail-config";

import Bestsellers from "./Bestsellers";

import { useCart } from "@/context/CartContext";
import type { ProductSpecs } from "@/lib/product-specs";
import type { StorefrontProduct, StorefrontVariant } from "@/lib/storefront";
import type { Batch } from "@/lib/types";

const money = (value: number) => formatMoney(Number(value) || 0);

const sameStrength = (a: string, b: string) =>
  a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

function Gallery({ product }: { product: StorefrontProduct }) {
  const images = useMemo(
    () => [product.image].filter(Boolean),
    [product.image],
  );
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setActive(0);
    setZoom(false);
  }, [product.slug]);

  useEffect(() => {
    if (!zoom) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [zoom]);

  const current = images[active] || images[0];

  return (
    <>
      <div className="lg:sticky lg:top-[100px]">
        <div className="relative h-[350px] w-full overflow-hidden rounded-[26px] sm:h-130 lg:h-140">
          {current ? (
            <Image
              key={current}
              src={current}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px"
              className="object-cover transition-transform duration-700 ease-out hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FlaskConical size={80} className="text-primary/25" />
            </div>
          )}
        </div>

        {images.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {images.map((src, index) => (
              <button
                key={src}
                type="button"
                aria-label={`View image ${index + 1}`}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
                className={`relative h-[76px] w-[76px] overflow-hidden rounded-xl border-2 bg-[#F9F3FA] transition-colors ${active === index ? "border-primary" : "hover:border-primary/30 border-transparent"}`}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="76px"
                  className="object-contain p-2"
                />
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 flex items-center gap-2 text-[11px] text-[#786D7C]">
          <FlaskConical size={15} className="text-primary" /> For laboratory
          research only
        </p>
      </div>
    </>
  );
}

function Strengths({
  variants,
  index,
  setIndex,
}: {
  variants: StorefrontVariant[];
  index: number;
  setIndex: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#29232D]">
          Select Strength
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {variants.map((variant, i) => {
          const selected = i === index;
          const soldOut = variant.inStock === false;

          return (
            <button
              key={variant.id || i}
              type="button"
              disabled={soldOut}
              aria-pressed={selected}
              onClick={() => setIndex(i)}
              className={`inline-flex min-h-10 items-center justify-center rounded-full border px-5 py-2 text-[13px] font-semibold transition-all duration-300 ${
                selected
                  ? "border-primary bg-primary text-white"
                  : "hover:border-primary hover:text-primary border-[#E8DCEA] bg-white text-[#514653]"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {variant.label}
              {soldOut && (
                <span className="ml-1.5 text-[10px] font-normal">
                  (Sold out)
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Packs({
  price,
  selectedPack,
  setSelectedPack,
  stock,
}: {
  price: number;
  selectedPack: number | null;
  setSelectedPack: (size: number | null) => void;
  stock: number;
}) {
  return (
    <section className="mt-7" aria-labelledby="packs-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-gold text-[11px] font-bold tracking-[0.12em] uppercase">
            More bottles. More savings.
          </p>
          <h2
            id="packs-title"
            className="font-heading mt-1 text-[22px] font-semibold tracking-tight text-[#29232D]"
          >
            Bundle & Save
          </h2>
        </div>
        <span className="text-gold rounded-full bg-[#FFF0E5] px-3 py-1.5 text-[11px] font-bold">
          UP TO 15% OFF
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {PACK_OPTIONS.map((pack) => {
          const selected = selectedPack === pack.quantity;
          const unavailable = pack.quantity > stock;
          const bottleCount = pack.quantity === 2 ? 2 : 3;
          const total = getPackPrice(
            price,
            pack.quantity,
            pack.discountPercent,
          );

          return (
            <button
              key={pack.quantity}
              type="button"
              disabled={unavailable}
              aria-pressed={selected}
              onClick={() => setSelectedPack(selected ? null : pack.quantity)}
              className={`group flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 ${
                selected
                  ? "border-primary bg-[#F8EFF9]"
                  : "hover:border-primary/40 border-[#EAE3EB] bg-white"
              }`}
            >
              <div className="relative h-[75px] w-[85px] shrink-0 sm:h-[90px] sm:w-[100px]">
                {Array.from({ length: bottleCount }).map((_, index) => {
                  const bottleWidth = 38;
                  const bottleHeight = 75;
                  const stepX = 17;
                  const groupWidth = bottleWidth + (bottleCount - 1) * stepX;

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

              <div className="flex min-w-0 flex-col items-center gap-1">
                <p className="font-heading text-primary text-sm leading-tight font-semibold whitespace-nowrap">
                  {pack.quantity} Vials
                </p>
                <p className="text-xs font-bold whitespace-nowrap text-emerald-600">
                  {pack.discountPercent}% OFF
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Quantity({
  value,
  onChange,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <div className="flex h-10 w-[100px] items-center justify-between rounded-full border border-[#E6DCE8] bg-white px-1 sm:h-13 sm:w-[112px]">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="text-primary grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30 sm:size-8"
      >
        <Minus size={14} />
      </button>

      <span className="font-heading text-primary text-[13px] font-bold">
        {value}
      </span>

      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="text-primary grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#F6E5F7] disabled:opacity-30 sm:size-8"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function Assurance({ certificate }: { certificate: string | null }) {
  const rows = [
    {
      icon: Package,
      title: "Packaging",
      description: "Securely packed for delivery.",
    },
    {
      icon: Truck,
      title: "Shipping",
      description: "Options shown at checkout.",
    },
    {
      icon: FileCheck2,
      title: "Documentation",
      description: certificate
        ? "Certificate available."
        : "Available on request.",
      href: certificate || "/contact",
      text: certificate ? "View Certificate" : "Contact Us",
      external: Boolean(certificate),
    },
    {
      icon: Headphones,
      title: "Support",
      description: "Questions? We're here to help.",
      href: "/contact",
      text: "Contact Us",
    },
  ];

  return (
    <section aria-label="Product services" className="mt-8">
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <article
              key={row.title}
              className="flex min-w-0 items-start gap-2.5 rounded-xl border border-[#E9E1E9] bg-[#FAF7FA] p-3"
            >
              <Icon
                size={20}
                strokeWidth={1.7}
                className="text-primary mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="font-heading text-primary text-sm font-semibold">
                  {row.title}
                </h3>
                <p className="text-muted mt-1 text-xs leading-5">
                  {row.description}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProductAccordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen ? true : undefined}
      className="group border-b border-[#EEE7EF]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="font-heading text-primary text-[16px] font-semibold sm:text-[17px]">
          {title}
        </span>

        <span className="text-primary flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F8EFF9]">
          <ChevronDown
            size={18}
            className="transition-transform duration-300 group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="pb-6 text-sm leading-7 text-[#756B78]">{children}</div>
    </details>
  );
}

type ProductDetailsProps = {
  product: StorefrontProduct;
  /** The lots on sale, newest first, from the lab report feed. */
  batches: Batch[];
  /** CAS number, weight and formula from WooCommerce's spec table. */
  specs: ProductSpecs;
};

export default function ProductDetails({
  product,
  batches,
  specs,
}: ProductDetailsProps) {
  const variants = product.variants;

  const [variantIndex, setVariantIndex] = useState(product.defaultVariant);
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");

  const addToCartRef = useRef<HTMLButtonElement>(null);
  const [showStickyCart, setShowStickyCart] = useState(false);

  useEffect(() => {
    const button = addToCartRef.current;
    if (!button) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const passedButton = entry.boundingClientRect.bottom <= 0;
        setShowStickyCart(!entry.isIntersecting && passedButton);
      },
      { threshold: 0 },
    );

    observer.observe(button);

    return () => observer.disconnect();
  }, []);

  const { addItem } = useCart();

  useEffect(() => {
    setVariantIndex(product.defaultVariant);
    setSelectedPack(null);
    setQuantity(1);
    setCartMessage("");
  }, [product.slug, product.defaultVariant]);

  useEffect(() => {
    if (!cartMessage) return;

    const id = setTimeout(() => setCartMessage(""), 3500);

    return () => clearTimeout(id);
  }, [cartMessage]);

  const variant = variants[variantIndex] || variants[0];

  const pack = PACK_OPTIONS.find((item) => item.quantity === selectedPack);
  const packSize = pack?.quantity ?? 1;

  const unitPrice = variant?.price ?? 0;
  const hasPrice = variant?.price != null && Number.isFinite(unitPrice);

  const bundleActive = Boolean(pack && quantity >= packSize);
  const discountPercent = bundleActive && pack ? pack.discountPercent : 0;

  const extraBottles = bundleActive ? quantity - packSize : 0;

  const totalPrice = bundleActive
    ? Math.round(
        (getPackPrice(unitPrice, packSize, discountPercent) +
          extraBottles * unitPrice) *
          100,
      ) / 100
    : Math.round(quantity * unitPrice * 100) / 100;

  const totalBottles = quantity;

  /* The catalogue carries an in/out flag, not a count. */
  const stock = Infinity;

  const maxQuantity = Math.min(99, stock);

  const canAdd =
    hasPrice &&
    variant?.inStock !== false &&
    quantity >= 1 &&
    quantity <= maxQuantity;

  /* Only what the store actually states: the spec table's chemistry rows when
     WooCommerce has them, the strengths on sale, and the research-use line. */
  const specificationRows = [
    { label: "CAS Number", value: specs.cas },
    { label: "Molecular Weight", value: specs.molecularWeight },
    { label: "Molecular Formula", value: specs.molecularFormula },
    {
      label: "Strengths",
      value: variants.map((item) => item.label).join(", ") || undefined,
    },
    { label: "Intended Use", value: "In-vitro research only" },
  ].filter((row): row is { label: string; value: string } =>
    Boolean(row.value),
  );

  /* The certificate for the strength on screen, else the newest current lot. */
  const batch =
    (variant &&
      batches.find((item) => sameStrength(item.strength, variant.label))) ??
    batches[0] ??
    null;
  const certificatePdf = batch?.report ?? null;

  const changeVariant = (index: number) => {
    setVariantIndex(index);
    setQuantity(selectedPack ?? 1);
  };

  const changePack = (size: number | null) => {
    setSelectedPack(size);
    setQuantity(size ?? 1);
  };
  const handleAddToCart = async () => {
    if (!variant || !canAdd) {
      setCartMessage("Selected quantity is unavailable.");
      return;
    }

    try {
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

      setCartMessage(added ? "" : "Unable to add product to cart.");
    } catch (error) {
      setCartMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to add product to cart.",
      );
    }
  };

  return (
    <main className="min-h-screen bg-white pb-8 lg:pb-0">
      {/* PRODUCT DETAILS */}

      <section className="px-4 pt-8 pb-12 sm:px-6 lg:px-10 lg:pt-12 lg:pb-16">
        <div className="mx-auto grid max-w-7xl items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10">
          {/* LEFT - PRODUCT GALLERY 60% */}

          <div className="min-w-0 self-stretch">
            <div className="lg:sticky lg:top-24">
              <Gallery product={product} />
            </div>
          </div>

          {/* RIGHT - PRODUCT INFORMATION 40% */}

          <div className="min-w-0">
            {/* CATEGORY */}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-primary rounded-full bg-[#F6E5F7] px-3 py-1.5 text-xs font-semibold tracking-widest uppercase">
                {product.category || "Research compound"}
              </span>
            </div>

            {/* PRODUCT NAME */}

            <h1 className="font-heading mt-4 text-[clamp(30px,3.5vw,48px)] leading-[1.1] font-semibold tracking-[-0.06em] text-[#29232D]">
              {product.name}
            </h1>

            <div className="my-5 h-px bg-[#EEE7EF]" />

            {/* STRENGTHS */}
            <Strengths
              variants={variants}
              index={variantIndex}
              setIndex={changeVariant}
            />

            {/* BUNDLES */}
            <Packs
              price={unitPrice}
              selectedPack={selectedPack}
              setSelectedPack={changePack}
              stock={variant?.inStock === false ? 0 : stock}
            />

            {/* QUANTITY + PRICE + CART */}
            <div className="mt-6">
              <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-4 lg:flex-nowrap lg:gap-3">
                <div className="shrink-0">
                  <Quantity
                    value={quantity}
                    onChange={setQuantity}
                    max={maxQuantity}
                  />
                </div>

                <div className="order-2 w-full lg:order-none lg:min-w-0 lg:flex-1">
                  <button
                    ref={addToCartRef}
                    type="button"
                    disabled={!canAdd}
                    onClick={handleAddToCart}
                    className="bg-primary flex h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-all hover:bg-[#35143E] disabled:cursor-not-allowed disabled:opacity-50 sm:h-13"
                  >
                    <ShoppingBag size={17} className="shrink-0" />
                    <span>{canAdd ? "Add to Cart" : "Unavailable"}</span>
                  </button>
                </div>

                <div className="order-1 ml-auto shrink-0 text-right lg:order-none">
                  <p className="font-heading text-primary text-[28px] font-semibold tracking-tight whitespace-nowrap lg:text-[clamp(18px,1.8vw,28px)]">
                    {hasPrice ? money(totalPrice) : "Unavailable"}
                  </p>
                </div>
              </div>
            </div>

            {/* CART MESSAGE */}
            {cartMessage && (
              <p
                role="status"
                className="text-primary mt-3 rounded-xl bg-[#F6E5F7] px-4 py-3 text-xs font-semibold"
              >
                {cartMessage}
              </p>
            )}

            {/* ASSURANCE */}
            <Assurance certificate={certificatePdf} />

            {/* ACCORDIONS */}
            <div className="mt-8 border-t border-[#EEE7EF]">
              {/* DESCRIPTION */}

              <ProductAccordion title="Product Description" defaultOpen>
                <p>
                  {product.description ||
                    `${product.name} is intended for appropriate scientific and laboratory research.`}
                </p>
              </ProductAccordion>

              {/* SPECIFICATIONS */}
              <ProductAccordion title="Specifications">
                <div className="overflow-hidden rounded-xl border border-[#EEE7EF]">
                  <table className="w-full border-collapse text-left">
                    <tbody>
                      {specificationRows.map((row, index) => (
                        <tr
                          key={row.label}
                          className={
                            index % 2 === 0 ? "bg-[#FBF8FC]" : "bg-white"
                          }
                        >
                          <th
                            scope="row"
                            className="w-1/2 border-b border-[#EEE7EF] px-4 py-4 text-sm font-medium text-[#756B78] last:border-b-0 sm:px-5"
                          >
                            {row.label}
                          </th>
                          <td className="text-primary border-b border-[#EEE7EF] px-4 py-4 text-right text-sm font-semibold break-words sm:px-5">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ProductAccordion>

              {/* RESEARCH USE */}
              <ProductAccordion title="Research Use">
                <div className="rounded-xl border border-[#EEE7EF] bg-[#FBF8FC] p-4">
                  <div className="flex items-start gap-3">
                    <FileCheck2
                      size={20}
                      className="text-primary mt-0.5 shrink-0"
                    />

                    <div>
                      <h4 className="font-heading text-primary text-[14px] font-bold">
                        For Research Use Only
                      </h4>

                      <p className="mt-2 text-sm text-[#756B78]">
                        This product is supplied exclusively for appropriate
                        laboratory and in-vitro research activities.
                      </p>

                      <p className="mt-2 text-sm text-[#756B78]">
                        Not intended for human consumption, clinical
                        administration, veterinary use, or diagnostic or
                        therapeutic purposes.
                      </p>
                    </div>
                  </div>
                </div>
              </ProductAccordion>
            </div>

            <div className="bg-[#FAF7FA] p-3 sm:p-6">
              <div className="mx-auto w-full max-w-[700px] overflow-hidden rounded-lg bg-white shadow-sm">
                {certificatePdf ? (
                  <>
                    {/* Mobile: open the certificate */}
                    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center md:hidden">
                      <FileText size={34} className="text-primary/60" />
                      <p className="font-heading text-primary text-sm font-semibold">
                        {product.name} Certificate of Analysis
                      </p>
                      {batch?.lot && (
                        <p className="text-xs text-[#756B78]">
                          Lot {batch.lot}
                        </p>
                      )}
                      <a
                        href={certificatePdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold text-white"
                      >
                        <Download size={14} />
                        View Certificate
                      </a>
                    </div>

                    {/* Desktop: PDF Viewer */}
                    <div className="relative hidden aspect-[5/7] w-full md:block">
                      <iframe
                        src={`${certificatePdf}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                        title={`${product.name} Certificate of Analysis`}
                        className="absolute inset-0 h-full w-full border-0"
                        loading="lazy"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                    <FileText size={34} className="text-primary/40" />
                    <p className="font-heading text-primary text-sm font-semibold">
                      Certificate not yet published
                    </p>
                    <p className="max-w-sm text-xs text-[#756B78]">
                      The Certificate of Analysis for this lot will appear here
                      once it is published. Contact us to request current
                      documentation.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Bestsellers currentProduct={product} />

      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#EDE5EE] bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[0_-8px_30px_rgba(40,0,45,0.08)] backdrop-blur-xl transition-all duration-300 lg:hidden ${
          showStickyCart
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-[#756B78]">
              {variant?.label} · {totalBottles} bottles
            </p>

            <p className="font-heading text-primary text-xl font-extrabold">
              {hasPrice ? money(totalPrice) : "Unavailable"}
            </p>
          </div>

          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAddToCart}
            className="bg-primary flex h-12 items-center gap-2 rounded-full px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
          >
            <ShoppingBag size={17} />
            Add to Cart
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
