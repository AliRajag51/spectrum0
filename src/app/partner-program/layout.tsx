import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Program | Spectrum Biosciences",
  alternates: { canonical: "/partner-program" },
};

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
