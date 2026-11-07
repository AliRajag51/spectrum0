# WordPress plugins

Two plugins, built from this directory by `npm run build:plugins` into
`dist/wordpress/` with a `manifest.json` of SHA-256 hashes.

| Plugin | Version | Folder |
|---|---|---|
| Peptide Collective Commerce | 1.4.0 | `peptide-collective-commerce/` |
| NVM Headless Core | 2.7.5 | `nvm-headless-bridge/` |

The contract both are built against is `docs/integration-contract.md`.

## What 1.4.0 adds: lab reports

The `lab-report` post type and its ACF fields - batch, date, purity, weight,
endotoxins, sterility, heavy metals, the PDF and the previous lot - are
published as one public read:

    GET /wp-json/tpc/v1/lab-reports

It answers `{ contract, generated, reports[] }` in the shape of contract
section 9.1, `Cache-Control: public, max-age=60`, every published report,
newest first. Values go out exactly as they were typed: an empty field stays
empty rather than becoming "Pass", and a date that does not parse as `d/m/Y`
goes out as `""` rather than as today.

Each report carries `product_key`, the storefront key it belongs to, and
`link`, which says how that was decided: `exact` when the whole title matches a
product, `derived` when the title splits into a product and a strength,
`unmatched` when neither holds. An unmatched report shows in the report library
and on no product page. To attach one by hand, set the override option, which
beats both rules:

    wp option set tpc_lab_report_links '{"15080":"glp-3-r"}' --format=json

Saving, trashing or restoring a report sends a signed `tpc.report` webhook to
the storefront through the same queue, secret and dedupe as `tpc.product`. The
body is `{"id":<post id>,"key":<product key or null>}`. To push them by hand:

    wp tpc-commerce reports              # every published report
    wp tpc-commerce reports --id=15080   # one

The route is behind the `tpc-store` REST gate like `/nvm/v1`, and the plugin
adds the allowlist entry for it. It is read-only and needs no key.

## Install order

1. Upload and activate `peptide-collective-commerce-1.7.0.zip`. It replaces the
   previous version in place; the pack pricing and stock alerts keep working
   unchanged. Activation seeds the `tpc_storefront_keys` option with the alias
   map from the contract. The lab report route needs no setting of its own.
2. Upload and activate `nvm-headless-bridge-2.3.3.zip`. It replaces 2.3.1 in
   place. Traffic owner stays `wordpress`, so nothing a visitor sees changes.
3. Fill the settings below.
4. Run the verification commands.

Both plugins survive activation with nothing configured: the commerce plugin
sends no webhooks while `tpc_storefront_url` is empty, and the core redirects
nobody while WordPress owns traffic.

## Settings

WooCommerce → Storefront sync (or `wp option set`):

| Option | Value |
|---|---|
| `tpc_storefront_url` | `https://www.peptidescollective.com` (origin only) |
| `tpc_storefront_webhook_secret` | the same value as `WOOCOMMERCE_WEBHOOK_SECRET` on Vercel |

Both can be pinned in `wp-config.php` instead, as `TPC_STOREFRONT_URL` and
`TPC_STOREFRONT_WEBHOOK_SECRET`; a constant wins over the option and disables
the field on the screen.

WooCommerce → Headless Core:

| Setting | Value |
|---|---|
| Production storefront | `https://www.peptidescollective.com` |
| Bridge key | shown on the page; copy it to `NVM_BRIDGE_KEY` on Vercel |
| Traffic owner | leave as WordPress until the storefront is verified end to end |

`http://localhost:3000` is only accepted as a handoff origin when
`wp-config.php` defines `NVM_BRIDGE_DEV_ORIGINS`. Do not define it on the
live site.

## Verify

    wp plugin list --status=active | grep -E "peptide-collective-commerce|nvm-headless-bridge"
    wp option get nvm_bridge_traffic_owner          # expect: wordpress
    wp option get tpc_storefront_keys --format=json # expect the alias map
    wp tpc-commerce refresh --key=glp-3-r           # one signed webhook, expect "ok ... HTTP 204"
    wp tpc-commerce refresh                         # every published product
    wp tpc-commerce reports --id=<a lab report id>  # one signed tpc.report webhook

Then from anywhere:

    curl -s https://peptidescollective.com/wp-json/wc/store/v1/products/5239 | jq .extensions.tpc
    curl -s https://peptidescollective.com/wp-json/tpc/v1/lab-reports | jq '.reports | length'
    curl -s -X POST https://peptidescollective.com/wp-json/nvm/v1/health -H "x-nvm-bridge-key: <key>"

The first shows the `extensions.tpc` object (the gate already allows product
reads). The second answers the report count, expect 58. The third answers 200
with `core_version: 2.3.3` and `site_plugin_version: 1.7.0`; a 401 on either of
the last two means the `tpc-store` allowlist entry is not active, so check the
commerce plugin is activated.

## Rollback

Deactivate both plugins from Plugins → Installed Plugins, or:

    wp plugin deactivate peptide-collective-commerce nvm-headless-bridge

Nothing else needs undoing. The options above are inert while the plugins are
off, and no database table is dropped or altered by either version.

## Local checks

    npm run lint:php       # parses every .php here with php-parser (PHP 8 grammar)
    npm run build:plugins  # ZIPs + manifest into dist/wordpress/

The parse check catches syntax errors only. `php -l` and PHPCS run on the
server, which has PHP.
