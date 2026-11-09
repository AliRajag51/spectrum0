import type { MetadataRoute } from "next";

import { env } from "@/env";
import { getCatalog } from "@/server/catalog";
import { indexingEnabled } from "@/server/indexing";

const STATIC_PATHS = [
  "",
  "/shop",
  "/coa",
  "/about",
  "/contact",
  "/faqs",
  "/partner-program",
  "/privacy-policy",
  "/refund-policy",
  "/research-disclaimer",
  "/terms-and-conditions",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexingEnabled()) return [];

  const base = env.NEXT_PUBLIC_SITE_URL;
  // The same cached catalogue read the pages use, so no extra store request.
  const products = await getCatalog();

  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...products.map((product) => ({ url: `${base}/products/${product.id}` })),
  ];
}
