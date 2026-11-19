import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Spectrum Biosciences",
  alternates: { canonical: "/contact" },
};

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
