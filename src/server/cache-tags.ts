/* Tag names for Next's data cache. Kept free of `server-only` and `next/*`
   so the webhook's tag selection can be tested under the node runner; the
   cache helpers in `cache.ts` re-export them for server code. */

export const publicCacheTags = {
  catalog: "public:catalog",
  reports: "public:reports",
  content: "public:content",
} as const;

/* One tag per storefront key, so a webhook about one product can name it.
   The key is the storefront id (`extensions.tpc.key`), never the WordPress
   slug, so `/product/r` and `glp-3-r` share a tag. */
export const productCacheTag = (key: string) => `product:${key}`;
