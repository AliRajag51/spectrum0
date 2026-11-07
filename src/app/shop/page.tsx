import ShopClient from "@/components/shop/ShopClient";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop Research Products | Spectrum Biosciences",
  description: "Browse the Spectrum Biosciences research product collection.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search;
  return <ShopClient initialSearch={search ?? ""} />;
}
