import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import CartShell from "@/components/cart/CartShell";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ResearcherGate from "@/components/ResearcherGate";
import { ProductsProvider } from "@/components/providers/ProductsProvider";
import { getStorefrontProducts } from "@/server/catalog";
import { T3Provider } from "@/trpc/react";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Spectrum Biosciences | Premium Research Peptides",
  description:
    "Explore premium research peptides from Spectrum Biosciences. Discover precision-focused products developed for laboratory research.",
};

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
            </CartShell>
          </ProductsProvider>
        </T3Provider>
      </body>
    </html>
  );
}
