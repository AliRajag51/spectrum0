import { z } from "zod";
import { productCacheTag, publicCacheTags } from "../cache-tags.ts";
import { storefrontKeyForSlug } from "./catalog-mapping.ts";

/* Which cache tags a verified webhook touches. Pure, so the node test runner
   can pin it; the route handler does the signing, size and dedupe checks
   before anything here runs.

   Two senders name a product. WooCommerce's own `product.*` topics carry the
   full product and identify it by slug, which the alias rule turns into the
   storefront key. The site plugin's `tpc.product` topic already carries the
   key. Both end in the same two tags, the product's own and the catalogue's,
   because the list every page renders from is one cache entry. */

/* `product.deleted` for a permanently removed product carries only the id,
   so the slug is optional; the catalogue tag alone then covers it. */
const nativeProductPayload = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).optional(),
});

const pluginProductPayload = z.object({
  id: z.number().int().positive(),
  key: z.string().min(1),
  reason: z.string().optional(),
});

/* `tpc.report` carries a lab report, whose key is null when the report
   matches no product. It expires the report feed and, when it does name a
   product, that product's page - which an ordinary stock change must not do,
   which is why the report has a topic of its own (section 9.4). */
const reportPayload = z.object({
  id: z.number().int().positive(),
  key: z.string().min(1).nullable(),
});

export type WebhookInvalidation =
  | { kind: "product"; key: string | null; tags: string[] }
  | { kind: "report"; key: string | null; tags: string[] }
  | { kind: "ignored"; tags: [] }
  | { kind: "malformed"; message: string };

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function productInvalidation(key: string | null): WebhookInvalidation {
  return {
    kind: "product",
    key,
    tags: key
      ? [productCacheTag(key), publicCacheTags.catalog]
      : [publicCacheTags.catalog],
  };
}

export function invalidationForWebhook(
  topic: string | null,
  body: string,
): WebhookInvalidation {
  if (!topic) return { kind: "ignored", tags: [] };

  if (topic === "tpc.product") {
    const parsed = pluginProductPayload.safeParse(parseJson(body));
    if (!parsed.success) {
      return { kind: "malformed", message: "tpc.product payload must carry id and key." };
    }
    return productInvalidation(parsed.data.key);
  }

  if (topic === "tpc.report") {
    const parsed = reportPayload.safeParse(parseJson(body));
    if (!parsed.success) {
      return { kind: "malformed", message: "tpc.report payload must carry id and key." };
    }
    const key = parsed.data.key;
    return {
      kind: "report",
      key,
      tags: key
        ? [publicCacheTags.reports, productCacheTag(key)]
        : [publicCacheTags.reports],
    };
  }

  if (topic.startsWith("product.")) {
    const parsed = nativeProductPayload.safeParse(parseJson(body));
    if (!parsed.success) {
      return { kind: "malformed", message: `${topic} payload must carry a product id.` };
    }
    return productInvalidation(
      parsed.data.slug ? storefrontKeyForSlug(parsed.data.slug) : null,
    );
  }

  /* Orders, coupons, customers: nothing the public cache holds. Acknowledged
     so WooCommerce does not retry, and left alone. */
  return { kind: "ignored", tags: [] };
}
