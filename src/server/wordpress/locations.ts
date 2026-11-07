import "server-only";

import { z } from "zod";
import { cachedPublic, publicCacheTags } from "@/server/cache";
import { createWooClient, wooConfig } from "@/server/wordpress/client";

/* Country and state reference data.

   Public, identical for every customer and effectively static, so it is cached
   at the server for a day rather than fetched per address form. The address
   panel needs it because WooCommerce validates a state against the list for
   its country, so a free-text field would fail for the US, Canada and every
   other country with a state table. */

const wooCountry = z.object({
  code: z.string(),
  name: z.string().default(""),
  states: z
    .array(z.object({ code: z.string(), name: z.string().default("") }))
    .default([]),
});

const STATES_TTL_SECONDS = 86_400;

export async function statesForCountry(
  country: string,
): Promise<Record<string, string>> {
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return {};
  const config = wooConfig();
  if (!config) return {};
  return cachedPublic({
    key: ["woo", "states", code],
    tags: [publicCacheTags.content],
    revalidate: STATES_TTL_SECONDS,
    loader: async () => {
      try {
        const payload = await createWooClient(config).request(
          `/wp-json/wc/v3/data/countries/${code}`,
          {},
          (value) => wooCountry.parse(value),
        );
        return Object.fromEntries(
          payload.states.map((state) => [state.code, state.name || state.code]),
        );
      } catch {
        // A missing list only costs the dropdown; the address save still
        // validates upstream, so this must not fail the whole form.
        return {};
      }
    },
  });
}
