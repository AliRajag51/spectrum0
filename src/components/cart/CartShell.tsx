"use client";

import { CartProvider } from "@/context/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import FloatingCart from "@/components/cart/FloatingCart";

export default function CartShell({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <FloatingCart />
      <CartDrawer />
    </CartProvider>
  );
}
