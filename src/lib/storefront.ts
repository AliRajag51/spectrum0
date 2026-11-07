import type { Product } from "./types";

/* The product shape Spectrum's UI components were built around. Every card,
   the product page, Quick View, search and the cart suggestions read this;
   it is derived from the domain `Product` (live WooCommerce or the offline
   snapshot) so the components never see where the data came from. */
export type StorefrontVariant = {
  id: string;
  /** WooCommerce's variation (or simple product) id; what the cart adds. Absent on the snapshot. */
  externalId?: number;
  label: string;
  price: number | null;
  compareAt: number | null;
  inStock: boolean;
  lot?: string;
};

export type StorefrontProduct = {
  id: string;
  externalId?: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  image: string;
  thumbnail?: string;
  badge: string | null;
  variants: StorefrontVariant[];
  defaultVariant: number;
};

export function toStorefrontProduct(product: Product): StorefrontProduct {
  const variants = product.variations.map((variation) => ({
    id: variation.id,
    ...(variation.externalId ? { externalId: variation.externalId } : {}),
    label: variation.strength,
    price: variation.price,
    compareAt: variation.compareAt ?? null,
    inStock: variation.inStock,
    ...(variation.lot ? { lot: variation.lot } : {}),
  }));
  const lead = variants.findIndex((variant) => variant.label === product.imageStrength);
  return {
    id: product.id,
    ...(product.externalId ? { externalId: product.externalId } : {}),
    slug: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    image: product.image,
    ...(product.thumbnail ? { thumbnail: product.thumbnail } : {}),
    badge: product.badge ?? null,
    variants,
    defaultVariant: lead >= 0 ? lead : 0,
  };
}

export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
