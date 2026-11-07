import type { Batch, Product } from "./types";
import { snapshotProducts, type SnapshotProduct } from "../data/products.ts";

export const storeConfig = {
  freeShippingThreshold: 250,
  gateEnabled: false,
  currency: "USD",
  snapshotDate: "2026-11-08",
};

/** A snapshot product in the domain shape the live WooCommerce read produces. */
export function fromSnapshot(item: SnapshotProduct): Product {
  const variations = item.variants.map((variant) => ({
    id: variant.id,
    strength: variant.label,
    price: variant.price,
    compareAt: variant.compareAt ?? null,
    inStock: variant.inStock,
  }));
  const sellable = variations.filter((variant) => variant.inStock);
  const lead = variations[item.defaultVariant] ?? variations[0];
  return {
    id: item.slug,
    badge: item.badge,
    name: item.name,
    category: item.category,
    image: item.image,
    imageStrength: lead?.strength ?? "",
    fromPrice: Math.min(...(sellable.length ? sellable : variations).map((variant) => variant.price)),
    description: item.description,
    source: "",
    variations,
  };
}

export const products: Product[] = snapshotProducts.map(fromSnapshot);

/* The batch records now arrive from WordPress, so the lookup takes the list
   the surface already holds instead of reaching for a module-level array. */
export const findBatch = (batches: Batch[], lot?: string) =>
  batches.find((b) => b.lot === lot);

const strengthKey = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/**
 * The published report for one strength of one product. The WooCommerce lot
 * wins when it names a published report. When the lot is blank or was typed
 * differently from the report's (both happen: a dozen strengths have reports
 * but no lot), the report is found the way the product page finds it - by
 * product and strength, newest current record first. A report with no
 * strength is only trusted for a product sold in a single strength, where it
 * cannot belong to another one. A strength with no report of its own gets
 * nothing: another strength's certificate is a different lot.
 */
export function findVariationBatch(
  batches: Batch[],
  target: { product: string; strength: string; lot?: string; singleStrength: boolean },
) {
  const byLot = target.lot ? findBatch(batches, target.lot) : undefined;
  if (byLot) return byLot;
  const current = batches
    .filter((batch) => batch.product === target.product && batch.status === "current")
    .sort((a, b) => b.date.localeCompare(a.date));
  const wanted = strengthKey(target.strength);
  return (
    current.find((batch) => strengthKey(batch.strength) === wanted) ??
    (target.singleStrength
      ? current.find((batch) => !strengthKey(batch.strength))
      : undefined)
  );
}
export const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
/* An em dash for a date WordPress does not have.
   Dates now arrive from a lab report rather than from this file, and a report
   whose ACF date is blank or malformed publishes "". Left alone, that reached
   `new Date("T12:00:00")` and printed the words "Invalid Date" on a customer's
   certificate card. Saying nothing is honest; saying "Invalid Date" is not. */
export const formatDate = (value: string) => {
  const parsed = new Date(value + "T12:00:00");
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
