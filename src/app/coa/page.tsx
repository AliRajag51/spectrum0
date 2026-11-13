import type { Metadata } from "next";
import CoALibrary from "@/components/coa/CoALibrary";
import { getLabReports } from "@/server/lab-reports";
import { getCatalog } from "@/server/catalog";
import { toStorefrontProduct } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Certificates of Analysis | Spectrum Biosciences",
  description:
    "Browse available batch-specific Certificates of Analysis for Spectrum Biosciences research products.",
};

export default async function CoAPage() {
  const [{ reports }, products] = await Promise.all([
    getLabReports(),
    getCatalog(),
  ]);
  const sampleProducts = products
    .filter(
      (product) => !reports.some((report) => report.image === product.image),
    )
    .map(toStorefrontProduct);
  return (
    <CoALibrary
      sampleProducts={sampleProducts}
      reports={[
        ...reports,
        ...sampleProducts.map((product) => ({
          id: `sample-${product.id}`,
          title: product.name,
          category:
            (
              {
                "Research Peptides": "peptides",
                "Research Blends": "blends",
                "Research Compounds": "compounds",
                "Research Solutions": "solutions",
              } as Record<string, string>
            )[product.category] ?? "",
          coa: "/assets/certificate.pdf",
          sourceCoa: "/assets/certificate.pdf",
          image: product.image,
          fields: [],
          previous: [],
          purity: null,
          pending: false,
          sample: true,
        })),
      ]}
    />
  );
}
