import "server-only";

import { env } from "@/env";
import { products as snapshotProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { cachedPublic, productCacheTag, publicCacheTags } from "@/server/cache";
import {
  joinUrl,
  storeApiHeaders,
  WordPressRequestError,
  wooStoreConfig,
} from "@/server/wordpress/client";
import { limitedRead } from "@/server/wordpress/read-limit";
import {
  readStoreCatalog,
  type StorePage,
} from "@/server/wordpress/catalog-mapping";

/* The catalogue is read through the authenticated NVM bridge, ranked by
   lifetime sales descending inside WordPress, and walked
   page by page until `x-wp-totalpages` runs out. No consumer key: everything
   beyond the stock fields comes from the site plugin's `extensions.tpc`
   (docs/integration-contract.md section 1). The result is held in Next's
   data cache for an hour and refreshed early by the signed webhook, so a
   visitor browsing never causes a WordPress request. */

const STORE_PAGE_SIZE = 100;
const CATALOG_TTL_SECONDS = 3600;

export interface CatalogRepository {
  listProducts(): Promise<Product[]>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
}

export class SnapshotCatalogRepository implements CatalogRepository {
  async listProducts() {
    return snapshotProducts;
  }

  async getProductsByIds(ids: string[]) {
    const wanted = new Set(ids);
    return snapshotProducts.filter((product) => wanted.has(product.id));
  }
}

/* `unstable_cache` writes an entry's tags before the loader runs, so the
   per-product tags cannot be read off the result they describe. They come
   from every key this process has seen: the snapshot's, plus each live read's.
   A product outside that set is still refreshed on its webhook, because the
   handler revalidates `public:catalog` alongside `product:<key>`. */
const knownKeys = new Set(snapshotProducts.map((product) => product.id));

function catalogTags() {
  return [publicCacheTags.catalog, ...[...knownKeys].sort().map(productCacheTag)];
}

async function fetchStorePage(
  baseUrl: string,
  timeoutMs: number,
  page: number,
): Promise<StorePage> {
  const url = new URL(joinUrl(baseUrl, "/wp-json/nvm/v1/catalog"));
  url.searchParams.set("per_page", String(STORE_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...storeApiHeaders() },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new WordPressRequestError(
        `The bridge refused the catalogue read (page ${page}).`,
        response.status,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WordPressRequestError(
        "The bridge returned an invalid JSON response.",
        response.status,
      );
    }
    return {
      body,
      totalPages: Number(response.headers.get("x-wp-totalpages") ?? "1"),
    };
  } catch (error) {
    if (error instanceof WordPressRequestError) throw error;
    throw new WordPressRequestError(
      error instanceof Error && error.name === "AbortError"
        ? "The catalog bridge timed out."
        : "The catalog bridge could not be reached.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

export class WooCatalogRepository implements CatalogRepository {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const config = wooStoreConfig();
    if (!config) throw new Error("WooCommerce catalog configuration is incomplete.");
    this.baseUrl = config.baseUrl;
    if (!env.NVM_BRIDGE_KEY) throw new Error("The catalog bridge requires NVM_BRIDGE_KEY.");
    this.timeoutMs = config.timeoutMs;
  }

  async listProducts() {
    const products = await cachedPublic({
      // The store URL is part of the key: pointing at another store must not reuse its cache.
      key: ["catalog", "nvm-bridge", "bestsellers-v1", this.baseUrl],
      tags: catalogTags(),
      revalidate: CATALOG_TTL_SECONDS,
      loader: () =>
        readStoreCatalog((page) => limitedRead(() => fetchStorePage(this.baseUrl, this.timeoutMs, page))),
    });
    for (const product of products) knownKeys.add(product.id);
    return products;
  }

  async getProductsByIds(ids: string[]) {
    const products = await this.listProducts();
    const wanted = new Set(ids);
    return products.filter((product) => wanted.has(product.id));
  }
}

export function createCatalogRepository(): CatalogRepository {
  if (env.WOOCOMMERCE_CATALOG_ENABLED === "true") {
    if (!wooStoreConfig()) {
      throw new Error("WooCommerce catalog is enabled but WOOCOMMERCE_URL is not set.");
    }
    return new WooCatalogRepository();
  }
  return new SnapshotCatalogRepository();
}
