"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emptyCart, type Cart, type CartLine } from "@/lib/cart";
import type { StorefrontProduct, StorefrontVariant } from "@/lib/storefront";
import { useTRPC } from "@/trpc/react";

/* The basket lives in WooCommerce.
 *
 * Nothing about it is stored in this browser: the cart is read through the
 * tRPC `cart` router (an HttpOnly cookie jar the page never sees carries the
 * WooCommerce session), and every price, discount and total on screen is the
 * one WooCommerce calculated. A mutation's answer is the whole recalculated
 * cart, so it replaces the cached one outright. Mutations share one scope so
 * quick clicks reach the store in the order they were made, and never retry
 * on their own (a retried add would add twice). */

export const CART_SETTINGS = {
  currency: "USD",
  /* WooCommerce's cart does not publish a free-shipping threshold, so the
     storefront keeps its own advertised one. */
  freeShippingThreshold: 150,
} as const;

/** Dollars (major units) to the display string the cart UI uses. */
export function formatCartMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CART_SETTINGS.currency,
  }).format(Number(value) || 0);
}

/** A cart line as the cart UI draws it. Money is in dollars, from WooCommerce. */
export type CartItem = {
  /** WooCommerce's cart item key; the handle for update/remove. */
  key: string;
  productId: string;
  variationId: string;
  /** Product page slug (the storefront slug is the product id). */
  slug: string;
  name: string;
  image: string;
  variantLabel: string;
  /** Bottles (vials) - the one quantity WooCommerce knows. */
  quantity: number;
  /** What WooCommerce charges per bottle, after any Bundle & Save tier. */
  unitPrice: number;
  /** The undiscounted per-bottle price. */
  regularUnitPrice: number;
  lineTotal: number;
  /** Bundle tier WooCommerce applied to this line, in percent. */
  discountPercent: number;
  /** WooCommerce's bundle saving on this line, in dollars. */
  bundleSavings: number;
};

export type AddItemOptions = { packSize?: number };

type CartContextValue = {
  items: CartItem[];
  isOpen: boolean;
  /** True once the first cart read has answered. */
  hydrated: boolean;
  /** True while a cart write is in flight. */
  busy: boolean;
  /** The last refusal, worded for the shopper; "" when none. */
  error: string;
  /** Resolves true once WooCommerce has the line(s), false if it refused. */
  addItem: (
    product: StorefrontProduct,
    variant: StorefrontVariant,
    quantity?: number,
    options?: AddItemOptions,
  ) => Promise<boolean>;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  /** Dollars, from WooCommerce. */
  subtotal: number;
  itemCount: number;
  remaining: number;
  freeShippingProgress: number;
  qualifiesForFreeShipping: boolean;
  /** WooCommerce's cart, for surfaces that need more than the lines. */
  cart: Cart;
};

const CartContext = createContext<CartContextValue | null>(null);

const MAX_LINE_QUANTITY = 99;

function toItem(line: CartLine): CartItem {
  return {
    key: line.key,
    productId: line.productId,
    variationId: line.variationId,
    slug: line.productId,
    name: line.name,
    image: line.image,
    variantLabel: line.strength,
    quantity: line.quantity,
    unitPrice: line.unitPrice / 100,
    regularUnitPrice: line.regularUnitPrice / 100,
    lineTotal: line.lineTotal / 100,
    discountPercent: line.discountPercent,
    bundleSavings: (line.bundleSavings ?? 0) / 100,
  };
}

/* Optimistic quantity change: the line moves at its current unit price, the
   totals are WooCommerce's again the moment it answers. Nothing is charged
   from this; it only keeps the stepper responsive. */
function withQuantity(cart: Cart, key: string, quantity: number): Cart {
  const lines =
    quantity <= 0
      ? cart.lines.filter((line) => line.key !== key)
      : cart.lines.map((line) =>
          line.key === key
            ? { ...line, quantity, lineTotal: line.unitPrice * quantity }
            : line,
        );
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    ...cart,
    lines,
    subtotal,
    total: subtotal + cart.totalShipping,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

type Snapshot = { previous: Cart | undefined };

const messageOf = (cause: unknown) =>
  (cause as { message?: string } | null)?.message ||
  "Your cart could not be updated. Please try again.";

export function CartProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");

  const options = trpc.cart.get.queryOptions();
  const queryKey = options.queryKey;
  const cartQuery = useQuery({ ...options, staleTime: 5 * 60_000 });

  const settle = useCallback(
    (cart: Cart) => {
      setError("");
      queryClient.setQueryData(queryKey, cart);
    },
    [queryClient, queryKey],
  );

  const begin = useCallback(
    async (provisional: (current: Cart) => Cart): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Cart>(queryKey);
      queryClient.setQueryData(queryKey, provisional(previous ?? emptyCart));
      setError("");
      return { previous };
    },
    [queryClient, queryKey],
  );

  const rollBack = useCallback(
    (cause: unknown, snapshot: Snapshot | undefined) => {
      setError(messageOf(cause));
      queryClient.setQueryData(queryKey, snapshot?.previous ?? emptyCart);
      // WooCommerce is the authority on what the basket now holds.
      void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey],
  );

  const addMutation = useMutation(
    trpc.cart.add.mutationOptions({
      scope: { id: "cart" },
      onMutate: async () => {
        setIsOpen(true);
        await queryClient.cancelQueries({ queryKey });
        setError("");
      },
      onSuccess: settle,
      onError: (cause) => {
        setError(messageOf(cause));
        void queryClient.invalidateQueries({ queryKey });
      },
    }),
  );
  const updateMutation = useMutation(
    trpc.cart.update.mutationOptions({
      scope: { id: "cart" },
      onMutate: (variables) =>
        begin((current) => withQuantity(current, variables.key, variables.quantity)),
      onSuccess: settle,
      onError: (cause, _variables, snapshot) => rollBack(cause, snapshot),
    }),
  );
  const removeMutation = useMutation(
    trpc.cart.remove.mutationOptions({
      scope: { id: "cart" },
      onMutate: (variables) => begin((current) => withQuantity(current, variables.key, 0)),
      onSuccess: settle,
      onError: (cause, _variables, snapshot) => rollBack(cause, snapshot),
    }),
  );
  const clearMutation = useMutation(
    trpc.cart.clear.mutationOptions({
      scope: { id: "cart" },
      onMutate: () => begin(() => emptyCart),
      onSuccess: settle,
      onError: (cause, _variables, snapshot) => rollBack(cause, snapshot),
    }),
  );

  const { mutateAsync: addLine } = addMutation;
  const { mutate: updateLine } = updateMutation;
  const { mutate: removeLine } = removeMutation;
  const { mutate: clearLines } = clearMutation;

  /* A pack is a quantity preset: "5 Bottles" adds five bottles, and the
     Bundle & Save tier (if any) is WooCommerce's to apply from that count. */
  const addItem = useCallback(
    async (
      product: StorefrontProduct,
      variant: StorefrontVariant,
      quantity = 1,
      opts: AddItemOptions = {},
    ) => {
      const packSize = Math.max(1, Math.floor(Number(opts.packSize) || 1));
      const count = Math.max(1, Math.floor(Number(quantity) || 1)) * packSize;
      if (!variant.inStock || variant.price === null) {
        setError("This product is out of stock.");
        setIsOpen(true);
        return false;
      }
      /* The offline snapshot carries no WooCommerce ids: there is nothing to
         add a line against until the live catalogue is on. */
      if (!variant.externalId) {
        setError("Online ordering is not available yet. Please check back soon.");
        setIsOpen(true);
        return false;
      }
      try {
        await addLine({
          productId: product.id,
          variationId: variant.id,
          quantity: Math.min(MAX_LINE_QUANTITY, count),
        });
        return true;
      } catch {
        return false; // reported through onError
      }
    },
    [addLine],
  );

  const updateQuantity = useCallback(
    (key: string, quantity: number) => {
      const next = Math.floor(Number(quantity));
      if (!Number.isFinite(next)) return;
      updateLine({ key, quantity: Math.max(0, Math.min(MAX_LINE_QUANTITY, next)) });
    },
    [updateLine],
  );
  const removeItem = useCallback((key: string) => removeLine({ key }), [removeLine]);
  const clearCart = useCallback(() => clearLines(), [clearLines]);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const cart = cartQuery.data ?? emptyCart;
  const items = useMemo(() => cart.lines.map(toItem), [cart.lines]);
  const subtotal = cart.subtotal / 100;
  const itemCount = cart.itemCount;
  const threshold = CART_SETTINGS.freeShippingThreshold;
  const remaining = Math.max(0, threshold - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / threshold) * 100);
  const busy =
    addMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending ||
    clearMutation.isPending;
  const hydrated = !cartQuery.isPending;

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      isOpen,
      hydrated,
      busy,
      error,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      openCart,
      closeCart,
      subtotal,
      itemCount,
      remaining,
      freeShippingProgress,
      qualifiesForFreeShipping: remaining <= 0,
      cart,
    }),
    [
      items,
      isOpen,
      hydrated,
      busy,
      error,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      openCart,
      closeCart,
      subtotal,
      itemCount,
      remaining,
      freeShippingProgress,
      cart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>.");
  return context;
}
