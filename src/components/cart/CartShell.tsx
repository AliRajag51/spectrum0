"use client";

import { CartProvider } from "@/context/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import FloatingCart from "@/components/cart/FloatingCart";

export default function CartShell({
  children,
  freeShippingThreshold = null,
}: {
  children: React.ReactNode;
  freeShippingThreshold?: number | null;
}) {
  return (
    <CartProvider freeShippingThreshold={freeShippingThreshold}>
      {children}
      <FloatingCart />
      <CartDrawer />
    </CartProvider>
  );
}
