import type { NextConfig } from "next";
import "./src/env";

/* Product imagery comes from the WordPress uploads directory once the live
   catalogue is on, so the image optimizer must trust that origin. Derived from
   WOOCOMMERCE_URL, scoped to the uploads path; empty while the flag is off. */
function wooImagePatterns() {
  const configured = process.env.WOOCOMMERCE_PUBLIC_URL || process.env.WOOCOMMERCE_URL;
  if (!configured) return [];
  try {
    const url = new URL(configured);
    const protocol = url.protocol.replace(":", "");
    if (protocol !== "http" && protocol !== "https") return [];
    return [
      { protocol: protocol as "http" | "https", hostname: url.hostname, pathname: "/wp-content/uploads/**" },
    ];
  } catch {
    return [];
  }
}

const config: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: wooImagePatterns() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default config;
