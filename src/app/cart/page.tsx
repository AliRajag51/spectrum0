import type { Metadata } from "next";
import CartPageClient from "./CartPageClient";

export const metadata: Metadata = {
  title: "Your Research Cart | 100 Peptides Research",
  description: "Review and update your research cart.",
};

/* `/api/checkout` sends the shopper back here when the WooCommerce handoff
   cannot go ahead (`?checkout=unavailable&reason=...`, `?checkout=empty`). */
function checkoutNotice(checkout: string | undefined) {
  if (checkout === "empty") {
    return "Your cart is empty. Add a product before checking out.";
  }
  if (checkout === "unavailable") {
    return "Checkout is temporarily unavailable. Your cart has been saved - please try again in a moment.";
  }
  return null;
}

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const checkout = typeof params.checkout === "string" ? params.checkout : undefined;
  return <CartPageClient checkoutNotice={checkoutNotice(checkout)} />;
}
