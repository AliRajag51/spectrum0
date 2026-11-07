import { redirect } from "next/navigation";

/* Orders are taken by WooCommerce's own checkout. `/api/checkout` hands the
   basket over (a full navigation, never a fetch); this path only forwards old
   links and bookmarks there. */
export const dynamic = "force-dynamic";

export default function CheckoutPage(): never {
  redirect("/api/checkout");
}
