"use client";

import { createContext, useContext } from "react";
import type { StorefrontProduct } from "@/lib/storefront";

/* The catalogue, read once on the server by the root layout (live WooCommerce
   or the offline snapshot) and handed to every client component that lists
   products: search, Quick View, cart suggestions, the account's reorder list.
   Server components read `getStorefrontProducts()` directly instead. */
const ProductsContext = createContext<StorefrontProduct[]>([]);

export function ProductsProvider({
  products,
  children,
}: {
  products: StorefrontProduct[];
  children: React.ReactNode;
}) {
  return <ProductsContext.Provider value={products}>{children}</ProductsContext.Provider>;
}

export const useProducts = () => useContext(ProductsContext);

export const useProduct = (slug: string | undefined) => {
  const products = useProducts();
  return slug ? products.find((product) => product.slug === slug) : undefined;
};
