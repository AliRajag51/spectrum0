import type { MetadataRoute } from "next";

import { env } from "@/env";
import { indexingEnabled, PRIVATE_PATHS } from "@/server/indexing";

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
    host: env.NEXT_PUBLIC_SITE_URL,
  };
}
