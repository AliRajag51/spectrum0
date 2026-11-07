import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

export { productCacheTag, publicCacheTags } from "@/server/cache-tags";

export function cachedPublic<T>(options: {
  key: string[];
  tags: string[];
  revalidate: number;
  loader: () => Promise<T>;
}) {
  return unstable_cache(options.loader, options.key, {
    tags: options.tags,
    revalidate: options.revalidate,
  })();
}

export function invalidatePublicTags(tags: readonly string[]) {
  for (const tag of tags) revalidateTag(tag);
}
