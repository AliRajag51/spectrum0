# Storefront ↔ WordPress integration contract

Binding for the Phase 1 build. Frontend (Next.js on www) and WordPress (apex,
peptidescollective.com) are built against this document, in parallel. Change
it here first, then in code.

Verified on the live site, 2026-09-17:

- WordPress 6.9.4, PHP 8.3.6, WooCommerce 10.9.4, HPOS, Redis object cache.
- `tpc-store` 1.0.0 replaces the WooCommerce session handler. The Store API
  `Cart-Token` header does NOT identify a cart here. Identity is the signed
  `tpc_cid` cookie. A mutation without identity returns
  `409 {"code":"tpc_needs_bootstrap"}` with `Set-Cookie: tpc_cid=...`
  (Max-Age 2592000, Path=/, Secure, HttpOnly, SameSite=Lax, host-only).
- A mutation with the cookie but no `Cart-Token` returns
  `401 woocommerce_rest_missing_nonce` and still carries a `Cart-Token`
  response header. A mutation with cookie + any valid token succeeds.
- Contended writes: `409 {"code":"tpc_cart_busy"}` with `Retry-After: 2`;
  Redis/kill-switch failure: `503 {"code":"tpc_store_unavailable"}` with
  `Retry-After: 3`. A rejected write is rolled back atomically. Re-sending the
  identical request is safe.
- Reads (`GET /wc/store/v1/cart`) never lock.
- Anonymous REST: `wc/store/v1/cart*` any method and `GET wc/store/v1/products*`
  are allowed. Everything else, including `nvm/v1`, is 401 until allowlisted
  via the `tpc_store_gate_rest_allowlist` filter.
- Checkout page is `/check-out/`. Guest checkout is enabled. Persistent carts
  (usermeta) are disabled by `tpc-store`.
- 43 products; 31 `simple`, 12 `variable`. `extensions` on products is empty
  today. Certificates live in table `{prefix}coa_reports_history`
  (`product_id, certificate_title, certificate_url, certificate_id,
  batch_number, certificate_date, uploaded_date, is_current`).

## 1. Product contract: `extensions.tpc` on Store API products

Published by Peptide Collective Commerce on `GET /wp-json/wc/store/v1/products`
and `/products/{id}` internally. The storefront calls the key-authenticated
NVM Headless Bridge endpoint `GET /wp-json/nvm/v1/catalog` only. The bridge
dispatches to WooCommerce inside WordPress with `orderby=popularity&order=desc`,
preserving this product schema and pagination headers. No loopback HTTP,
`wc/v3`, or consumer key. The bridge key stays on the Next.js server.

```jsonc
{
  "contract": 1,
  "key": "glp-3-r",              // storefront id. WP slug, except aliases below
  "category": "GLP",             // "GLP" | "Metabolics" | "Blends" | "Peptides"
  "image_strength": "10 MG",     // strength shown on the pack render, or null
  "lot": "TPC-2161",             // current lot for the parent, or null
  "certificates": [              // newest first, parent product rows
    { "id": 812, "title": "GLP-3/R - COA", "url": "https://.../coa.pdf",
      "batch": "TPC-2161", "date": "2026-08-30", "current": true }
  ],
  "coa": {                       // the certificate picture the PDP shows
    "image": "https://.../GLP-3-R-20mg_TPC-2161_COA-pdf.jpg",
    "width": 683, "height": 1007,
    "purity": "99.91%",          // "" when the report has no percentage
    "lot": "TPC-2161"
  },
  "variations": [                // [] for simple products
    { "id": 5241, "strength": "10 MG", "price": "18900", "regular_price": "18900",
      "in_stock": true, "lot": "TPC-2161", "certificates": [ /* same shape */ ] }
  ]
}
```

Rules:

- `price`/`regular_price` are minor-unit strings exactly as the Store API
  formats parent prices (respect `currency_minor_unit`).
- `key` defaults to the product slug. Alias map lives in the plugin (option
  `tpc_storefront_keys`, default `{"r":"glp-3-r","s":"glp-1-s","t":"glp-2-t"}`)
  so WordPress slugs never have to change.
- `category` is derived from `product_cat` slugs: contains `glp` → GLP,
  `metabolic` → Metabolics, `blend` → Blends, else Peptides. Same rule the
  frontend uses today in `catalog-mapping.ts`.
- `strength` is the option of the first attribute whose name contains
  `strength` (case-insensitive); else the joined attribute options.
- `lot` for a product/variation is `batch_number` of its `is_current` row;
  `certificates` is the full history for that `product_id`, ordered by the
  plugin's own `COA_Database::ORDER_CURRENT` when the class exists, else by
  `certificate_date DESC, uploaded_date DESC, id DESC`.
- `coa` is the second gallery image on the WordPress product page, published
  because the storefront cannot read it: the theme appends it through
  `woocommerce_product_get_gallery_image_ids` behind an `is_product()` check,
  so `images[]` in REST only ever carries the vial. Resolution is the theme's
  (`tpc_coa_current_report_id`): the newest report **by post date**, skipping
  one with no `batch`, one whose certificate has no PDF attachment, and the
  shared "COA coming soon" placeholder; the picture is that PDF's generated
  first page, never the `report_image_*` slots. Every field is `""`/`0` when
  the product has no real certificate, which is how the storefront knows to
  show one image instead of two. 40 of 43 products carry one today, matching
  the live product pages exactly.
- A simple product with no variations is mapped by the frontend to one
  default variation using the parent price and stock, as `catalog-mapping.ts`
  already does.
- Missing `extensions.tpc` (plugin inactive, older cache) is a hard error for
  the catalogue read, never silently an empty catalogue. The frontend falls
  back to its last known-good snapshot and logs the degraded read.

## 2. Cart identity: the WordPress cookie jar

The storefront server keeps, per shopper, one HttpOnly cookie `pc_wp` that
holds an encrypted, signed JSON jar:

```jsonc
{ "v": 1,
  "cid": "tpc_cid=v1%7C...",                   // exact Set-Cookie value pair
  "wcs": "wp_woocommerce_session_5539...=...",  // exact pair, optional
  "token": "eyJ...",                            // Cart-Token, optional
  "count": 0 }
```

- Encryption: AES-256-GCM, key = HKDF-SHA256(`CART_SESSION_KEY`, info
  `pc-wp-jar-v1`). `CART_SESSION_KEY` is a new server env (min 32 chars);
  falls back to `NVM_BRIDGE_KEY` when unset. With neither, the cart reports
  `unavailable` and never calls WordPress.
- Max-Age 30 days (the `tpc_cid` lifetime). Path=/, Secure in production,
  SameSite=Lax. Refreshed on every response that changed the jar.
- Every Store API call sends `Cookie: <cid>; <wcs>` and `Cart-Token: <token>`
  when present, and updates the jar from `Set-Cookie` (`tpc_cid`,
  `wp_woocommerce_session_*`) and the `Cart-Token` response header.
- The readable badge cookie `pc_cart` (count) stays as it is.
- Member binding (`wc_cart_owner`) stays: on sign-out the jar is dropped.

Bootstrap (first mutation of a shopper with an empty jar), one round of two
parallel calls, then the real one:

1. In parallel: `GET /cart` with no identity (yields a `Cart-Token`) and the
   real `POST /cart/add-item` with no identity (yields `409 tpc_needs_bootstrap`
   + `tpc_cid`). If that POST unexpectedly returns 201, accept it as applied.
2. `POST /cart/add-item` again with cookie + token → 201.

Outcomes the transport returns (discriminated union, never thrown):

| outcome | when | transport action | client action |
|---|---|---|---|
| `applied` | 2xx with a valid cart | update jar | replace cache |
| `busy` | 409 `tpc_cart_busy` / 429 | wait `Retry-After` (cap 3 s), resend the identical request once | keep optimistic state |
| `bootstrap` | 409 `tpc_needs_bootstrap` | store cid, resend once | keep optimistic state |
| `token_lost` | 401/403 with `woocommerce_rest_missing_nonce`, `woocommerce_rest_invalid_nonce`, `woocommerce_rest_cart_token_invalid` | `GET /cart` with the jar's cookies to obtain a token (identity preserved), resend once | keep optimistic state |
| `refused` | other 4xx | none | roll back, show WooCommerce's message |
| `unavailable` | 503 `tpc_store_unavailable`, any other 5xx, timeout, unreadable body | none. The jar is NOT cleared and NO new session is minted | roll back, show "cart unavailable, try again" |

A 5xx is never a reason to mint a new session. That rule replaces the current
`rejectedSession` behaviour.

Timeouts: reads 5 s; writes 12 s (the lock can wait 2 s before answering).

## 3. Optimistic cart (browser)

- TanStack mutations with `scope: { id: "cart" }` so they run in series.
- `onMutate`: cancel in-flight cart queries, snapshot, write the provisional
  cart (line from the cached catalogue: name, image, strength, unit price ×
  quantity at the Bundle & Save tier that quantity earns), mark
  `totals: "updating"`. Drawer opens on the click.
- `onSuccess`: `setQueryData` with the server cart.
- `onError`: restore snapshot, `invalidateQueries`, show the outcome message
  inside the drawer.
- Cart query: `staleTime` 5 minutes, `refetchOnWindowFocus` only when the
  `pc_cart` count cookie differs from the cached count. No polling.

## 4. Catalogue caching and invalidation

- Server read: `GET /nvm/v1/catalog?per_page=100` (+ pagination), with
  `X-NVM-Bridge-Key`, the configured API timeout, and no automatic retries. Zod
  validated including `extensions.tpc`. Cached with `unstable_cache`, tags
  `public:catalog` and `product:<key>` per product, `revalidate: 3600`.
  The bridge returns `Cache-Control: private, no-store`; Next.js alone caches
  the public product data. Its `bestsellers-v1` cache key prevents reuse of
  the old unsorted catalog. Ranking uses recorded lifetime units sold, including
  accessories, and refreshes with the catalog. It is not a live sales feed.
- `/shop` and `/product/[slug]` are static (no `searchParams` on the server;
  `generateStaticParams` from the catalogue; `revalidate = 3600`).
- Webhook `POST /api/webhooks/woocommerce` (already exists). Signature:
  `X-WC-Webhook-Signature` = base64(HMAC-SHA256(rawBody, secret)). Topics:
  WooCommerce native `product.updated|created|deleted` (payload carries
  `id`, `slug`), and the plugin's own `X-WC-Webhook-Topic: tpc.product` with
  body `{"id": 5239, "key": "glp-3-r", "reason": "stock|price|certificate|save"}`.
  Handler revalidates `product:<key>` and `public:catalog`.

## 5. WordPress plugin: Peptide Collective Commerce 1.2.0

Additive modules, each in `includes/`:

- `class-tpc-product-contract.php`: registers `extensions.tpc` via
  `woocommerce_blocks_loaded` → `ExtendSchema::register_endpoint_data` on the
  product schema. Variation data via `wc_get_product`; certificates via
  `$wpdb` on `{prefix}coa_reports_history` (guard: table exists).
- `class-tpc-gate-allowlist.php`:
  `add_filter('tpc_store_gate_rest_allowlist', fn($p) => [...$p, '#^/nvm/v1(/|$)#i'])`.
- `class-tpc-storefront-revalidation.php`: on `woocommerce_update_product`,
  `woocommerce_new_product`, `woocommerce_product_set_stock`,
  `woocommerce_variation_set_stock`, `woocommerce_product_set_stock_status`,
  `woocommerce_variation_set_stock_status`, `wp_trash_post`/`untrashed_post`
  for products, queue one Action Scheduler async job per product key
  (deduplicated within 10 s) that POSTs the signed `tpc.product` webhook to
  `{tpc_storefront_url}/api/webhooks/woocommerce`. Settings via options
  `tpc_storefront_url`, `tpc_storefront_webhook_secret`, overridable by
  constants `TPC_STOREFRONT_URL`, `TPC_STOREFRONT_WEBHOOK_SECRET`. Nothing is
  sent when the URL is empty. A WP-CLI command `wp tpc-commerce refresh
  [--key=<key>]` sends the webhook on demand (certificate uploads have no
  hook of their own).

### 5.1 Bundle & Save (v1.6.0)

The same rule Aminohaus runs, in `class-tpc-bundle-save.php`. It replaced the
pack tier that travelled as cart item data, which opened a line per tier and
multiplied with the quantity stepper: "2 Packs" with the stepper on two was
charged as `Thymalin (2-vial pack) × 4` beside a separate `Thymalin × 1`.

- **The tier is a function of the line quantity and nothing else.** A tier
  starts at its `min` and holds until the next begins, so four vials earn the
  three-vial rate. One strength is one line; adding it again grows that line.
- Applied on `woocommerce_before_calculate_totals` at priority 25 from a
  freshly loaded base price, so it cannot compound across the hook's repeated
  runs and comes off whatever price a sale or member rule already set.
- Defaults: 1 → 0%, 2 → 4% ("Save 4%"), 3 → 7% ("Save 7%"), **5 → 0%**. The
  last one is the boundary: a tier holds until the next begins, so four vials
  get 7% and five get nothing, which is the owner's rule and what the old
  `{5: 0}` table said. A 0% tier past the base is never drawn as a choice.
  Editable at **Bundle & Save** in wp-admin (option `tpc_bundle_tiers`); one
  switch, `tpc_bundle_enabled`, turns off both the discount and the
  advertising.
- Published at `GET /wp-json/tpc/v1/bundle-tiers` →
  `{ enabled, tiers: [{ min, percent, label, badge }] }`, public, cached 60 s.
  The storefront reads it into the same cache tag as the catalogue
  (`public:catalog`, 1 h) and falls back to the same defaults when unreachable;
  `enabled: false` hides the bundle block. A save in wp-admin queues a
  `tpc.product` delivery, which expires that tag, so no second webhook exists
  for one setting.
- Each Store API cart line carries `extensions.tpc = { discount_percent,
  bundle_savings }` (minor units). Nothing is sent *to* the Store API but
  `{ id, quantity }`.
- Order lines are not stamped and item names are not suffixed: the discount
  is in the line price, which is where refunds and emails already read it.

Stock alerts are unchanged.

## 6. WordPress plugin: NVM Headless Core 2.3.2 (from the 2.3.1 zip in this repo)

Required changes before activation on the live site:

1. `wp_robots` and `robots_txt` filters run only when
   `nextjs_owns_traffic()`.
2. `LOCAL_FRONTEND` (`http://localhost:3000`) is in the origin allowlist only
   when the constant `NVM_BRIDGE_DEV_ORIGINS` is defined.
3. The `rest_post_dispatch` no-store header applies to `/nvm/v1/` and
   `/wc/store/v1/cart` routes only, never to product reads.
4. `handle_auth_return` bails (no redirect, no exit) when no frontend URL is
   configured.
5. `order_attribute_options` (`woocommerce_product_read_attribute`) runs only
   when `nextjs_owns_traffic()`.
6. Handoff accepts an `identity` object: `{ "cid": "<tpc_cid cookie value>",
   "wcs": "<wp_woocommerce_session pair or null>" }` in place of (or alongside)
   `cart_token`. On redemption the core sets those cookies on the browser with
   the same attributes WordPress uses, sets the auth cookie for a member as it
   does today, and redirects to `wc_get_checkout_url()`. It does NOT write the
   WooCommerce session on the handoff request (that write would be discarded
   by `tpc-store` on a non-mutating request).
7. `nvm-cart-return` and `redeem-code` for `adopt` return
   `{ "identity": { "cid": ..., "wcs": ... } }` read from the returning
   browser's cookies, so the storefront rebuilds its jar.
8. `nvm_bridge_paths` defaults match this storefront: `cart` `/cart`,
   `account` `/account`, `account_orders` `/account/orders`,
   `account_order` `/account/orders/{id}`, `account_addresses`
   `/account/addresses`, `account_details` `/account/details`,
   `lost_password` `/account/lost-password`, `reset_password`
   `/account/reset-password`, `shop` `/shop`, `product` `/product/{slug}`,
   `contact` `/contact-us`, `legal_privacy` `/privacy-policy`,
   `legal_terms` `/terms-and-conditions`, `legal_shipping`
   `/shipping-returns-policy`.
9. Brand strings and the `Nextgen_Commerce` version reference replaced
   (`TPC_Bundle_Save::VERSION`).
10. Traffic owner default stays `wordpress`. Checkout skin default stays off.

## 7. Environment (storefront)

```
WOOCOMMERCE_URL=https://peptidescollective.com
WOOCOMMERCE_CATALOG_ENABLED=true
WOOCOMMERCE_WEBHOOK_SECRET=<same value as tpc_storefront_webhook_secret>
NVM_BRIDGE_KEY=<from WooCommerce → Headless Core>
CART_SESSION_KEY=<32+ random chars>
SITE_URL=https://www.peptidescollective.com
```

`WOOCOMMERCE_CONSUMER_KEY/SECRET` are no longer needed by the catalogue.

## 8. Decided: an expired login empties the basket (parity with live)

Owner decision, 2026-09-17. Do not "fix" this without asking.

When a member's WordPress login stops being valid and they sign in again, the
basket does not come back. That is not a defect in this storefront: the live
store does the same thing. Verified on the local replica, which runs the
client's own `tpc-store` plugin and classic WooCommerce checkout:

| Step | Classic WordPress (as live) | This storefront |
| --- | --- | --- |
| Member signed in, item in cart | item shown | item shown |
| Login expires | cart empty | cart empty |
| Member signs in again | cart still empty | cart still empty |

Cause: `tpc-store` forces `woocommerce_persistent_cart_enabled` to false, so
WooCommerce never saves a member's cart to user meta and never restores it.
The client disabled it deliberately, because that write happens outside their
session lock and could restore a basket the lock had rejected.

On this side the same outcome comes from the `wc_cart_owner` binding in
`src/lib/cart-cookie.ts`: the jar is bound to the login credential that held
it, and a new credential does not match, so the jar is dropped. Keep that
binding. It is what stops a member's basket being shown to whoever uses the
browser next.

Improving on live would mean re-binding the jar to the new credential on
sign-in, in this storefront only. Do not re-enable WooCommerce persistent
carts to achieve it; that reverses the client's fix.

## 9. Lab reports: the analytical numbers

Owner brief, 2026-09-17: fix the wiring, do not touch the design. Every
component keeps its current props and markup; only the source of the data
changes, from a hardcoded file to WordPress.

### The problem

WordPress holds certificates in two places. We already publish the first.

| Source | Holds | Published today |
| --- | --- | --- |
| `{prefix}coa_reports_history` | PDF, lot, date, per product | yes, in `extensions.tpc.certificates` |
| `lab-report` post type, 58 posts, ACF | `batch`, `date`, `purity`, `weight`, `endotoxins`, `sterility`, `heavy_metals`, the PDF, `previous_batch`, `previous_batch_url` | **no** |

So the analysis numbers the pages show come from `batches` and
`archivedReports` in `src/lib/catalog.ts`, written by hand. They are stale,
cover only a handful of products, and cannot change when WordPress does.

### 9.1 Contract: `GET /wp-json/tpc/v1/lab-reports`

New public read in Peptide Collective Commerce. One call returns all
published reports. Registered in the gate allowlist alongside `nvm/v1`.

```jsonc
{
  "contract": 1,
  "generated": "2026-09-17T10:00:00+00:00",
  "reports": [
    {
      "id": 15080,
      "title": "GLP-3/R - 20 MG",
      "lot": "TPC-2764",          // ACF batch, trimmed; "" when unset
      "date": "2026-08-05",       // ISO. ACF stores d/m/Y; see 9.3
      "purity": "99.82%",         // verbatim, never parsed into a number here
      "weight": "11.27mg AVG",
      "endotoxins": "Pass (LAL)",
      "sterility": "",            // empty means not recorded, never "Pass"
      "heavy_metals": "Pass (ICP-MS)",
      "report": "https://.../COA.pdf",
      "previous": { "label": "Previous batch: TPC-1437", "href": "https://..." },
      "product_key": "glp-3-r",   // storefront key, or null
      "strength": "20 MG",        // parsed from the title, or ""
      "link": "derived"           // "exact" | "derived" | "unmatched"
    }
  ]
}
```

- `Cache-Control: public, max-age=60`. The storefront caches it under its own
  tag and does not poll.
- Reports are returned newest first by `date`, then `id`.

### 9.2 Linking a report to a product

Titles are `Name` or `Name - Strength`, with inconsistent separators seen in
the data: `-`, `–`, `- 10mg`, `-100 MG`, `Selank+Semax - 20MG`.

Resolution order, first hit wins:

1. `exact` — the whole title matches a product name or slug, case-insensitive.
2. `derived` — the title splits on the last separator; the left side matches a
   product name or slug, and the right side parses as a strength.
3. `unmatched` — `product_key` is null.

24 of 58 resolve `exact` today; most of the rest are per-strength. Several
reference discontinued products (HCG, SNAP-8, AHK-Cu, Hexarelin) and stay
`unmatched` on purpose.

**A report is never attached to a product by guesswork.** `unmatched` reports
appear in the Batch Report Library as history and on no product page. An
override map lives in option `tpc_lab_report_links` (`{"<report id>": "<key>"}`)
for anything a human needs to correct; it wins over 1 and 2.

### 9.3 Dates

ACF stores `d/m/Y`. `17/09/2026` proves the order. The plugin converts to ISO
`Y-m-d` before publishing; the storefront never parses `d/m/Y`. A value that
does not parse is published as `""`, never as today's date.

### 9.4 Invalidation

A `lab-report` save, trash or untrash queues the existing revalidation job with
topic **`tpc.report`** and body `{"id":<post id>,"key":"<product key|null>"}`.
This is the case the separate topic earns: it expires `public:reports` plus
`product:<key>` when the report resolves to one, which `tpc.product` must not
do for an ordinary stock change.

Same queue, same signing, same ten second dedupe, same single retry.

### 9.5 Storefront: data source only

`Batch`, `ArchivedReport` and `ProductReport` keep their exact current shapes,
so no component's props or markup change.

- `src/lib/catalog.ts` loses `batches` and `archivedReports`. They become
  server reads that build the same shapes from 9.1, cached under
  `public:reports`, `revalidate: 3600`.
- `lab-report-ledger.tsx`, `products.tsx` and `why-different.tsx` are client
  components importing those arrays directly. They receive the same arrays as
  props from their server parents instead. Props in, identical render out.
- `report` maps from the ACF PDF, `purity` parses to the number `Batch` wants
  (`"99.82%"` → `99.82`), `status` is `current` for a product's newest lot and
  `historical` otherwise, `checks` is built from the non-empty
  endotoxins/sterility/heavy-metals values only.
- A failed read keeps the last good cached value; it must not empty the
  library. With no cache and a failed read the library renders its existing
  empty state.

### 9.6 Cost

One extra cached read per hour per deployment, plus one webhook per report
edit. Browsing causes no WordPress request, as now. The hardcoded arrays leave
the client bundle, which makes the shop and report pages smaller, not larger.
