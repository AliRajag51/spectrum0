import { z } from "zod";
import type { Category, Certificate, Product, Variation } from "../../lib/types.ts";
import { productSpecs } from "../../lib/product-specs.ts";

/* Pure Store API -> domain mapping. Deliberately free of `server-only`,
   `next/*` and path aliases so the contract can be exercised directly by the
   node test runner against captured `wc/store/v1` payloads.

   The read is anonymous: `GET /wp-json/wc/store/v1/products` needs no consumer
   key. Everything the storefront needs beyond the stock Store API fields
   (storefront key, category, lot, certificates, per-variation price and
   stock) arrives in `extensions.tpc`, published by the site plugin. See
   docs/integration-contract.md section 1. */

export const storefrontCategory = z.string().min(1);

/* A minor-unit amount as the Store API formats it: "18900" for $189.00 with
   `currency_minor_unit` 2. Empty means "no price", which a variable parent
   without purchasable variations can legitimately report. */
const minorUnitAmount = z.string().regex(/^\d*$/);

export const tpcCertificate = z.object({
  id: z.number().int(),
  title: z.string(),
  url: z.string(),
  batch: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  current: z.boolean(),
});

export const tpcVariation = z.object({
  id: z.number().int().positive(),
  strength: z.string(),
  price: minorUnitAmount,
  regular_price: minorUnitAmount,
  in_stock: z.boolean(),
  lot: z.string().nullable().default(null),
  certificates: z.array(tpcCertificate).default([]),
});

/* `contract` is a literal on purpose: a plugin publishing version 2 must fail
   this read, which degrades the storefront to its snapshot and logs, rather
   than be half-understood. The nullable fields default so an omitted `lot`
   reads the same as an explicit null. */
/* The certificate picture the WordPress product page shows beside the vial.
   It defaults whole rather than per-field, because a plugin older than 1.5.0
   publishes no `coa` at all and an absent certificate has to read the same as
   a product that genuinely has none: one image in the gallery. */
export const tpcCoa = z.object({
  image: z.string().default(""),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
  purity: z.string().default(""),
  lot: z.string().default(""),
});

export const tpcExtension = z.object({
  contract: z.literal(1),
  key: z.string().min(1),
  category: storefrontCategory,
  image_strength: z.string().nullable().default(null),
  lot: z.string().nullable().default(null),
  certificates: z.array(tpcCertificate).default([]),
  coa: tpcCoa.default({ image: "", width: 0, height: 0, purity: "", lot: "" }),
  variations: z.array(tpcVariation).default([]),
});

/* The extension is optional at the schema level only so that a product
   without it can be named in the error `mapStoreProduct` throws; the read as
   a whole still fails, as the contract requires. */
export const storeProduct = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().min(1),
  type: z.string(),
  permalink: z.string().optional(),
  description: z.string().default(""),
  short_description: z.string().default(""),
  prices: z.object({
    price: minorUnitAmount,
    regular_price: minorUnitAmount,
    currency_code: z.string().optional(),
    currency_minor_unit: z.number().int().min(0).max(4),
  }),
  images: z
    .array(z.object({ src: z.string().min(1), srcset: z.string().optional() }))
    .default([]),
  categories: z.array(z.object({ slug: z.string().optional() })).default([]),
  attributes: z
    .array(
      z.object({
        name: z.string().default(""),
        terms: z.array(z.object({ name: z.string() })).default([]),
      }),
    )
    .default([]),
  variations: z.array(z.object({ id: z.number().int().positive() })).default([]),
  is_in_stock: z.boolean(),
  extensions: z.object({ tpc: tpcExtension.optional() }).default({}),
});

export const storeProducts = z.array(storeProduct);

export type StoreProduct = z.infer<typeof storeProduct>;
export type TpcExtension = z.infer<typeof tpcExtension>;
export type TpcVariation = z.infer<typeof tpcVariation>;

export class StoreContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreContractError";
  }
}

/* WordPress slugs the storefront addresses under a different key. Mirrors the
   plugin's `tpc_storefront_keys` default, so a native WooCommerce webhook,
   which only carries the slug, still names the right cache tag. */
export const storefrontKeyAliases: Readonly<Record<string, string>> = {
  r: "glp-3-r",
  s: "glp-1-s",
  t: "glp-2-t",
};

export function storefrontKeyForSlug(slug: string) {
  return storefrontKeyAliases[slug] ?? slug;
}

/* Cards are at most 307px wide, or about 330px on a one-column phone, so a
   1024px copy covers a 3x screen. Uploads are often 2048px originals, and one
   5.4MB PNG was enough to time out the image optimizer on every card. */
const THUMBNAIL_MIN_WIDTH = 1024;

/** The smallest WordPress-generated copy at least 1024px wide, if one exists. */
export function thumbnailFor(image?: { src: string; srcset?: string }) {
  if (!image?.srcset) return undefined;
  const candidates = image.srcset
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      return { url, width: Number.parseInt(descriptor ?? "", 10) };
    })
    .filter(
      (item): item is { url: string; width: number } =>
        !!item.url && item.width >= THUMBNAIL_MIN_WIDTH && item.url !== image.src,
    )
    .sort((a, b) => a.width - b.width);
  return candidates[0]?.url;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

/* "40 MG" -> 40, so strengths order the way the selector expects rather than by
   WooCommerce's row order. */
function strengthValue(strength: string) {
  const match = /([\d.]+)/.exec(strength);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/* "3769" with two minor units -> 37.69. The domain keeps prices in major
   units because that is what `money()` and the filters take. */
export function priceFromMinorUnits(raw: string, minorUnit: number) {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw) / 10 ** minorUnit;
}

/* The category rule the plugin mirrors (contract section 1). The storefront
   reads `extensions.tpc.category` and no longer derives it, but the rule
   stays here as the reference the contract cites, and the tests pin it. */
export function categoryFor(slugs: string[]): Category {
  const value = slugs.join(" ").toLowerCase();
  if (value.includes("blend")) return "Research Blends";
  if (value.includes("solution")) return "Research Solutions";
  if (value.includes("compound")) return "Research Compounds";
  return "Research Peptides";
}

function mapCertificate(certificate: z.infer<typeof tpcCertificate>): Certificate {
  return {
    id: certificate.id,
    title: certificate.title,
    url: certificate.url,
    batch: certificate.batch ?? undefined,
    date: certificate.date ?? undefined,
    current: certificate.current,
  };
}

/** The regular price, only when it is above the selling price. */
function saleCompareAt(price: string, regular: string, minorUnit: number) {
  const now = priceFromMinorUnits(price, minorUnit);
  const was = priceFromMinorUnits(regular, minorUnit);
  return now !== null && was !== null && was > now ? was : null;
}

function mapVariation(variation: TpcVariation, minorUnit: number): Variation {
  return {
    id: String(variation.id),
    externalId: variation.id,
    strength: variation.strength,
    price: priceFromMinorUnits(variation.price || variation.regular_price, minorUnit),
    compareAt: saleCompareAt(variation.price, variation.regular_price, minorUnit),
    inStock: variation.in_stock,
    lot: variation.lot ?? undefined,
    certificates: variation.certificates.map(mapCertificate),
  };
}

/* The same rule the plugin applies for variation strengths, used only when
   the plugin gave no `image_strength` for a simple product. */
function attributeStrength(product: StoreProduct) {
  const attribute =
    product.attributes.find((item) => item.name.toLowerCase().includes("strength")) ??
    product.attributes[0];
  return attribute?.terms.map((term) => term.name).join(" / ") ?? "";
}

export function mapStoreProduct(product: StoreProduct): Product {
  const tpc = product.extensions.tpc;
  if (!tpc) {
    throw new StoreContractError(
      `Store API product ${product.id} (${product.slug}) has no extensions.tpc; ` +
        "is the Spectrum commerce plugin active and the object cache fresh?",
    );
  }
  const minorUnit = product.prices.currency_minor_unit;
  const mapped = tpc.variations
    .map((variation) => mapVariation(variation, minorUnit))
    .sort((a, b) => strengthValue(a.strength) - strengthValue(b.strength));

  /* A simple product has no variations of its own, so it gets one default
     variation priced and stocked from the parent. A variable product with no
     published variations lands here too, so the card still shows a price. */
  const resolved: Variation[] = mapped.length
    ? mapped
    : [
        {
          id: `${tpc.key}-default`,
          externalId: product.id,
          strength: tpc.image_strength ?? attributeStrength(product),
          price: priceFromMinorUnits(product.prices.price, minorUnit),
          inStock: product.is_in_stock,
          lot: tpc.lot ?? undefined,
          certificates: tpc.certificates.map(mapCertificate),
        },
      ];

  const thumbnail = thumbnailFor(product.images[0]);
  // CAS number, molecular weight and formula, from the description's spec table (the processor's check).
  const specs = productSpecs(product.description);
  const sellable = resolved.filter((item) => item.inStock && item.price !== null);
  const priced = (sellable.length ? sellable : resolved)
    .map((item) => item.price)
    .filter((value): value is number => value !== null);

  return {
    id: tpc.key,
    externalId: product.id,
    name: product.name,
    category: tpc.category,
    image: product.images[0]?.src ?? "",
    ...(thumbnail ? { thumbnail } : {}),
    imageStrength: tpc.image_strength ?? resolved[0]?.strength ?? "",
    fromPrice: priced.length ? Math.min(...priced) : 0,
    description: stripHtml(product.short_description) || stripHtml(product.description),
    ...(Object.keys(specs).length ? { specs } : {}),
    source: product.permalink ?? "",
    variations: resolved,
    lot: tpc.lot ?? undefined,
    certificates: tpc.certificates.map(mapCertificate),
    ...(tpc.coa.image
      ? {
          coa: {
            image: tpc.coa.image,
            width: tpc.coa.width,
            height: tpc.coa.height,
            purity: tpc.coa.purity,
            lot: tpc.coa.lot,
          },
        }
      : {}),
  };
}

/* One page of the Store API list: the body as received and the page count
   from the `x-wp-totalpages` header. The loader is injected so the walk can
   be tested against fixtures without a network. */
export type StorePage = { body: unknown; totalPages: number };
export type StorePageLoader = (page: number) => Promise<StorePage>;

/* Bounded so a header claiming a million pages cannot turn one catalogue
   read into a loop; 20 pages of 100 is far beyond the 43 products live. */
const MAX_STORE_PAGES = 20;

/**
 * Walk every page of the product list and map it. Any product without the
 * plugin's extension throws, so a half-published catalogue never replaces
 * the last good one.
 */
export async function readStoreCatalog(loadPage: StorePageLoader): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const loaded = await loadPage(page);
    const parsed = storeProducts.parse(loaded.body);
    if (!parsed.length) break;
    for (const product of parsed) products.push(mapStoreProduct(product));
    totalPages = Math.min(
      Number.isSafeInteger(loaded.totalPages) && loaded.totalPages > 0 ? loaded.totalPages : 1,
      MAX_STORE_PAGES,
    );
    page += 1;
  } while (page <= totalPages);
  return products;
}
