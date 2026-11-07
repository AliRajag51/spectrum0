import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetails from "@/components/ProductDetails";
import { getProduct, getStorefrontProduct, getStorefrontProducts } from "@/server/catalog";
import { getLabReports } from "@/server/lab-reports";
import { currentBatchesFor } from "@/server/wordpress/lab-report-mapping";

type ProductPageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const products = await getStorefrontProducts();
  return products.map((product) => ({
    slug: product.slug,
  }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  const product = await getStorefrontProduct(slug);

  if (!product) {
    return {
      title: "Product Not Found | Spectrum Biosciences",
    };
  }

  return {
    title: `${product.name} | Spectrum Biosciences`,
    description:
      product.description ||
      `${product.name} — For laboratory research use only.`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  const product = await getStorefrontProduct(slug);

  if (!product) notFound();

  /* The certificates and spec table come from the same reads the rest of the
     site uses; an offline store simply has none and the page says so. */
  const [library, domainProduct] = await Promise.all([
    getLabReports(),
    getProduct(product.id),
  ]);

  return (
    <ProductDetails
      product={product}
      batches={currentBatchesFor(product.name, library.batches)}
      specs={domainProduct?.specs ?? {}}
    />
  );
}
