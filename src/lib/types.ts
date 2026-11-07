import type { ProductSpecs } from "./product-specs.ts";

/* Spectrum's shop categories. WordPress publishes the name in
   `extensions.tpc.category`; anything new it sends still renders. */
export type Category =
  | "Research Peptides"
  | "Research Blends"
  | "Research Compounds"
  | "Research Solutions"
  | (string & {});
export type Batch = {
  lot: string;
  product: string;
  strength: string;
  /* Absent when the lab recorded no percentage. That is not rare and not an
     error: a four-peptide blend like KLOW has no single purity to state, and
     NAD's report simply never had one entered. A batch with a lot number and
     no purity is still a batch, and dropping it took its lot, its weight and
     its certificate off the product page along with the figure it lacked. */
  purity?: number;
  /* The purity exactly as the certificate prints it, "99.83% AVG" and all.
     28 of the 52 reports that carry a reading call it an average and 24 do
     not, so the word cannot be added or dropped by rule - only quoted. */
  purityLabel?: string;
  date: string;
  weight?: string;
  report: string;
  status: "current" | "historical";
  category: Category;
  readings?: number[];
  checks?: Record<string, string>;
};
/* One row of the WordPress certificate history, as the site plugin publishes
   it on the Store API product. Newest first; `current` marks the lot on sale. */
export type Certificate = {
  id: number;
  title: string;
  url: string;
  batch?: string;
  date?: string;
  current: boolean;
};
export type Variation = {
  id: string;
  externalId?: number;
  strength: string;
  price: number | null;
  /** The regular price when the variation is on sale; shown struck through. */
  compareAt?: number | null;
  inStock: boolean;
  lot?: string;
  certificates?: Certificate[];
};
/* The certificate the WordPress product page shows beside the vial: the first
   page of the current lot's PDF, and the purity printed on it. Absent when the
   product has no real certificate, which is what makes the gallery show one
   image rather than two. */
export type ProductCoa = {
  image: string;
  width: number;
  height: number;
  purity: string;
  lot: string;
};
export type Product = {
  /** The storefront key, which is also the URL slug: /products/<id>. */
  id: string;
  /** A merchandising label ("Featured", "Popular"); null for none. */
  badge?: string | null;
  externalId?: number;
  name: string;
  category: Category;
  image: string;
  /* WordPress's own 1024px copy of `image`, for the small places a product
     photo appears: cards, carts, search. The original stays for the product
     page and its zoom. Absent when WordPress made no smaller copy. */
  thumbnail?: string;
  cutout?: string;
  imageStrength: string;
  fromPrice: number;
  description: string;
  /** CAS number, molecular weight and formula from WordPress's spec table, when it has them. */
  specs?: ProductSpecs;
  variations: Variation[];
  source: string;
  lot?: string;
  certificates?: Certificate[];
  coa?: ProductCoa;
};
export type ArchivedReport = {
  lot: string;
  product: string;
  strength: string;
  category: Category;
  report: string;
  status: "historical";
  purity?: number;
  date?: string;
  weight?: string;
};

/** One lab report as a product page shows it. */
export type ProductReport = {
  lot: string;
  date: string;
  purity: string;
  report: string;
  checks: string[];
  weight: string;
  previous: { label: string; href: string } | null;
};
