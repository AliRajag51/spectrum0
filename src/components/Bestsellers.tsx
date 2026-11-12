"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ArrowRight, FlaskConical } from "lucide-react";
import { useProducts } from "@/components/providers/ProductsProvider";
import type { StorefrontProduct } from "@/lib/storefront";

function getDisplayProducts(
  products: StorefrontProduct[],
  currentProduct: StorefrontProduct | null,
) {
  const availableProducts = products.filter(
    (product) => product.slug !== currentProduct?.slug,
  );

  if (currentProduct) {
    return availableProducts
      .sort((a, b) => {
        const aMatch = a.category === currentProduct.category ? 1 : 0;
        const bMatch = b.category === currentProduct.category ? 1 : 0;

        return bMatch - aMatch;
      })
      .slice(0, 8);
  }

  const bestsellers = availableProducts.filter((product) =>
    /best.?sell/i.test(product.badge || ""),
  );

  return bestsellers.length ? bestsellers : availableProducts.slice(0, 8);
}
function BestsellerCard({ product }: { product: StorefrontProduct }) {
  const variant = product.variants[product.defaultVariant];
  const price = variant?.price;
  const compareAt = variant?.compareAt;
  const hasDiscount =
    typeof price === "number" &&
    typeof compareAt === "number" &&
    compareAt > price;

  return (
    <article className="group relative w-[245px] shrink-0 sm:w-[280px] lg:w-[310px]">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative overflow-hidden rounded-[24px] bg-[#F7EFF8] p-3 transition-all duration-500 group-hover:bg-[#F0E1F3] sm:rounded-[28px]">
          <div className="relative aspect-[4/4.5] overflow-hidden rounded-[18px] bg-[#F7EFF8] sm:rounded-[22px]">
            <div className="border-primary/10 pointer-events-none absolute h-[180px] w-[180px] rounded-full border sm:h-[220px] sm:w-[220px]" />

            <div className="border-primary/[0.07] pointer-events-none absolute h-[130px] w-[130px] rounded-full border sm:h-[165px] sm:w-[165px]" />

            <div className="absolute inset-0 h-full w-full overflow-hidden">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 245px, (max-width: 1024px) 280px, 310px"
                  className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-110"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <FlaskConical size={75} className="text-primary/30" />
                </div>
              )}
            </div>

            <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between">
              <span className="border-primary/10 text-primary rounded-full border bg-white/90 px-3 py-1.5 font-sans text-[10px] font-semibold backdrop-blur-md">
                {variant?.label || "Research Product"}
              </span>

              <span className="bg-primary group-hover:bg-gold flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(85,32,95,0.2)] transition-all duration-300 group-hover:rotate-45">
                <ArrowUpRight size={20} />
              </span>
            </div>
          </div>
        </div>

        <div className="px-2 pt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="bg-gold h-1.5 w-1.5 rounded-full" />

            <span className="text-muted font-sans text-[10px] font-semibold tracking-[0.12em] uppercase">
              {product.category || "Research Peptides"}
            </span>
          </div>

          <h3 className="font-heading text-primary group-hover:text-gold text-[17px] leading-[1.3] font-bold tracking-[-0.045em] transition-colors duration-300 sm:text-[20px]">
            {product.name}
          </h3>

          <div className="border-primary/10 mt-3 flex items-center justify-between border-t pt-3">
            <div>
              <div className="flex items-center gap-2">
                {typeof price === "number" ? (
                  <>
                    <span className="font-heading text-primary text-[20px] font-bold tracking-[-0.05em]">
                      ${price.toFixed(2)}
                    </span>

                    {hasDiscount && (
                      <span className="text-muted font-sans text-sm line-through">
                        ${compareAt.toFixed(2)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted font-sans text-[13px]">
                    View details
                  </span>
                )}
              </div>
            </div>

            <span className="text-primary group-hover:text-gold font-sans text-sm font-semibold transition-colors">
              View Product
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default function Bestsellers({
  currentProduct = null,
}: {
  currentProduct?: StorefrontProduct | null;
}) {
  const products = useProducts();
  const displayProducts = getDisplayProducts(products, currentProduct);

  if (!displayProducts.length) return null;

  const isProductPage = Boolean(currentProduct);

  const marqueeProducts =
    displayProducts.length >= 4
      ? displayProducts
      : [...displayProducts, ...displayProducts];

  return (
    <section
      id="bestsellers"
      aria-labelledby="bestsellers-title"
      className="relative overflow-hidden px-4 sm:px-6 md:py-16 lg:px-10"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[650px]">
            <p className="text-gold mb-4 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.15em] uppercase">
              {isProductPage ? "Continue Exploring" : "Explore Spectrum"}
            </p>

            <h2 id="bestsellers-title" className="section-heading">
              {isProductPage ? (
                <>
                  Related <span className="text-gold">Compounds.</span>
                </>
              ) : (
                <>
                  Research <span className="text-gold">Favorites.</span>
                </>
              )}
            </h2>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-10 max-w-7xl sm:mt-12">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-24 bg-gradient-to-r from-white to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-24 bg-gradient-to-l from-white to-transparent lg:block" />

        <div className="bestseller-marquee overflow-hidden">
          <div className="bestseller-track flex w-max items-stretch">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                aria-hidden={copy === 1}
                inert={copy === 1}
                className="flex shrink-0 items-stretch gap-4 pr-4 sm:gap-5 sm:pr-5 lg:gap-6 lg:pr-6"
              >
                {marqueeProducts.map((product, index) => (
                  <BestsellerCard
                    key={`${copy}-${product.id}-${index}`}
                    product={product}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spectrum-bestseller-scroll {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        .bestseller-track {
          animation: spectrum-bestseller-scroll 45s linear infinite;
        }

        .bestseller-marquee:hover .bestseller-track,
        .bestseller-marquee:focus-within .bestseller-track {
          animation-play-state: paused;
        }

        @media (max-width: 640px) {
          .bestseller-track {
            animation-duration: 32s;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bestseller-track {
            animation: none;
          }

          .bestseller-marquee {
            overflow-x: auto;
          }
        }
      `}</style>
    </section>
  );
}
