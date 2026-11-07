# WordPress plugins

Spectrum's storefront runs headless against its WooCommerce site through the
same two plugins as Peptide Collective. The contract both speak is
`docs/integration-contract.md`.

| Plugin | Version | Folder | Role |
|---|---|---|---|
| Spectrum Commerce | 1.7.2-spectrum.1 | `spectrum-commerce/` | Shop-specific: `extensions.tpc` product contract, lab reports feed, restock alerts, Bundle & Save tiers, revalidation webhook. Forked from Peptide Collective Commerce 1.7.2. |
| NVM Headless Core | 2.7.5 | `nvm-headless-bridge/` | Shared: accounts, cart sessions, checkout handoff, redirect policy. Unchanged from Peptide Collective. |

The internal `tpc` prefix (option names, `/wp-json/tpc/v1/*`, `extensions.tpc`,
the `tpc_cid` cart cookie) is kept on purpose: the storefront code and the
bridge already read those names. Only the plugin name, categories, default
aliases and storefront hostnames were changed for Spectrum.

Categories come from each product's `product_cat` slugs: `blend` → Research
Blends, `solution` → Research Solutions, `compound` → Research Compounds,
anything else → Research Peptides. Storefront keys are the WooCommerce slugs,
so `/products/<slug>` on the storefront matches the product's WordPress slug.
Set `_tpc_product_key` meta on a product to override.

## Install (dev clone first)

1. Zip `spectrum-commerce/` and `nvm-headless-bridge/`, upload and activate both.
2. WooCommerce → Storefront sync:
   - `tpc_storefront_url`: the storefront origin, e.g. `https://www.spectrumbioscience.com`
   - `tpc_storefront_webhook_secret`: same value as `WOOCOMMERCE_WEBHOOK_SECRET` on Vercel
3. WooCommerce → Headless Core:
   - Production storefront: the storefront origin
   - Bridge key: copy to `NVM_BRIDGE_KEY` on Vercel
   - Traffic owner: leave as WordPress until the storefront is verified end to end
4. For local development, define `NVM_BRIDGE_DEV_ORIGINS` in `wp-config.php`
   so `http://localhost:3000` is accepted as a handoff origin. Never on live.

## Verify

    wp plugin list --status=active | grep -E "spectrum-commerce|nvm-headless-bridge"
    curl -s https://<store>/wp-json/wc/store/v1/products?per_page=1 | jq '.[0].extensions.tpc'
    curl -s https://<store>/wp-json/tpc/v1/lab-reports | jq '.reports | length'
    curl -s -X POST https://<store>/wp-json/nvm/v1/health -H "x-nvm-bridge-key: <key>"

Then set `WOOCOMMERCE_CATALOG_ENABLED=true` on the storefront.

## Notes

- `nvm-headless-bridge/includes/marketing.php` only acts on Peptide Collective's
  hosts, so it is inert on Spectrum's.
- The lab reports feed expects the `lab-report` post type with ACF fields as on
  Peptide Collective (batch, date, purity, weight, endotoxins, sterility, heavy
  metals, PDF, previous lot). If Spectrum's site stores COAs differently, the
  feed in `class-tpc-lab-reports.php` needs adapting.

## Rollback

    wp plugin deactivate spectrum-commerce nvm-headless-bridge
