# Spectrum Biosciences storefront

Headless storefront on the same foundation as Peptide Collective: Next.js 15
App Router, React 19, strict TypeScript, T3 Env (`src/env.ts`), tRPC v11 with
TanStack Query and SuperJSON, Zod 4, Tailwind 4. WordPress/WooCommerce is the
backend, reached through the NVM Headless Core bridge and the Spectrum Commerce
plugin (`integrations/wordpress/`, contract in `docs/integration-contract.md`).

    npm install
    cp .env.example .env.local   # fill in the store URL and keys
    npm run dev

## How it fits together
- Catalogue: `src/server/catalog.ts` reads the WooCommerce Store API
  (`extensions.tpc`) when `WOOCOMMERCE_CATALOG_ENABLED=true`; otherwise the
  offline snapshot in `src/data/products.ts`. Components get it as
  `StorefrontProduct` (`src/lib/storefront.ts`) via `useProducts()`.
- Cart: a real WooCommerce cart (`cart` tRPC router), sealed in an encrypted cookie.
- Checkout: `/api/checkout` hands the basket to WooCommerce's own checkout; payment
  is whatever gateway the WordPress site runs.
- Accounts: WordPress accounts via the bridge (`account` tRPC router).
- Lab reports (COA), order tracking, stock alerts, contact form: WordPress-backed.
- `/api/webhooks/woocommerce` revalidates cached product/report pages.

## Checks
`npm run typecheck`, `npm run build`.
