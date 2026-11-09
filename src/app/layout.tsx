import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import CartShell from "@/components/cart/CartShell";
import EmailPopup from "@/components/EmailPopup";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ResearcherGate from "@/components/ResearcherGate";
import { ProductsProvider } from "@/components/providers/ProductsProvider";
import { env } from "@/env";
import { getStorefrontProducts } from "@/server/catalog";
import { indexingEnabled } from "@/server/indexing";
import { T3Provider } from "@/trpc/react";
import "@/styles/globals.css";

export function generateMetadata(): Metadata {
  const indexable = indexingEnabled();
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    title: "Spectrum Biosciences | Premium Research Peptides",
    description:
      "Explore premium research peptides from Spectrum Biosciences. Discover precision-focused products developed for laboratory research.",
    robots: { index: indexable, follow: indexable },
  };
}

const headingFont = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const products = await getStorefrontProducts();
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body className="antialiased">
        <T3Provider>
          <ProductsProvider products={products}>
            <ResearcherGate />
            <CartShell>
              <Header />
              {children}
              <Footer />
              <EmailPopup />
            </CartShell>
          </ProductsProvider>
        </T3Provider>
      </body>
    </html>
  );
}
