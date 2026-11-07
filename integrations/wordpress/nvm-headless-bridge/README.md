# NVM Headless Core

Reusable WordPress/WooCommerce transport for NVM headless storefronts. The
directory slug remains `nvm-headless-bridge` for compatible in-place upgrades.

Owns REST transport, authentication, account operations, cart/session recovery,
single-use checkout handoff, origin validation, redirect policy, generic
checkout isolation, maintenance mode and shipping facts. It must contain no
site-specific product contract, certificate, pricing or brand logic.

Configure it in WooCommerce → Headless Core. The server-only bridge key must
match `NVM_BRIDGE_KEY` on the Next.js deployment.

`GET /wp-json/nvm/v1/catalog` uses that key and the existing bridge rate
limits. It accepts `page` (1–20) and `per_page` (1–100), and returns published
WooCommerce Store API products in descending lifetime-sales order. WooCommerce
is dispatched internally, preserving visibility, language, companion-plugin
extensions and total/page-count headers. The bridge response is no-store;
the storefront caches public catalog data for one hour. Install this catalog
module before deploying a storefront that uses this endpoint.

The **Require login to browse the Next.js storefront** and **Require an account
at checkout** checkboxes are independent. Saving sends a signed change notice
to the storefront, which rereads the protected `health` route and updates Global
Config. Middleware reads the replicated policy; it falls back to a direct
Bridge read when Global Config is absent or unavailable. A failed push is retried
and the plugin reconciles daily. The second checkbox changes WooCommerce's own
guest checkout setting, which Next.js reads on each guest checkout attempt.
Neither needs a gate-specific Next.js environment variable. Global Config
connection and write credentials are separate deployment configuration.

## The storefront path contract

The core has to know where the storefront publishes its cart, account and
checkout routes before it can redirect anyone to them. Those paths are not
hardcoded: `NVM_Headless_Bridge::path_defaults()` lists every one, and a
storefront that differs overrides only the keys it differs on.

    // Somewhere that runs on WordPress, or as an option of the same name.
    add_filter('nvm_bridge_paths', function (array $paths): array {
        $paths['shop']    = '/products';
        $paths['account'] = '/my-account';
        return $paths;
    });

    update_option('nvm_bridge_paths', array('cart' => '/basket'));

Keys are `home`, `shop`, `product`, `cart`, `contact`, the `account*` family
and the `api_*` routes the handoff calls back into. `{slug}`, `{order_id}` and
`{kind}` are filled in at redirect time; a `{order_id}` left in a receipt path
is substituted later by the receipt itself.

WordPress pages map separately, because only some of them are renamed on the
storefront. `nvm_bridge_page_map` (option or filter) maps a WordPress page slug
to a storefront path; anything unlisted keeps its own slug, so a site whose
pages line up one-for-one needs no configuration.

Overrides are validated with the same `safe_path()` that guards the receipt
settings. An absolute URL, a protocol-relative `//host` value or one carrying a
newline is refused and the shipped default is used, so a bad entry cannot turn
an internal redirect into an off-site one.

## 2.7.6: WordPress's own sign-in and reset links (Oct 21)

- **The router leaves WordPress's own flows alone.** `route_customer_request()`
  now returns early when the request carries one of `WORDPRESS_KEYS` (`tpc_sl`,
  `view`, `key`, `show-reset-form`, ...) or a `nvm-` / `wapu_` key, the
  same rule `target_for_path()` already used. Before, the sign-in page and
  `my-account/lost-password` were redirected with campaign keys only, so a
  reset link lost its key (found in the agency's task 16 retest).
- **/live/ and /research/ stay on WordPress:** added to `OWNED_PAGE_SLUGS`, as
  the agency asked on Oct 21. The storefront sends both back to WordPress too.

## 2.7.5: the agency's Oct 12 review

- **/start/ stays on WordPress** (the only landing page of a live Microsoft
  campaign): the router never redirects it, and `target_for_path()` returns
  null for it. It is in `OWNED_PAGE_SLUGS`, which the
  `nvm_bridge_wordpress_owned_page_slugs` filter still extends.
- **Spanish orders:** the `nvm-shopper` extension takes `lang`. A language WPML
  runs is written to the order as `wpml_language`, and again after checkout in
  case a language plugin overwrote it.
- **Wallet on the order:** `/checkout/complete` takes `wallet` (`card`,
  `apple_pay` or `google_pay`, default `card`), stored as
  `_nvm_storefront_wallet` and named in the order note.
- **Marketing consent:** `me` and every session carry `user.marketing_opt_in`
  (true, false, or null for never answered), read from the site's consent
  meta (`nvm_bridge_consent_user_meta`, default `tpc_research_updates`). The
  storefront ticks its checkout box only for true. Storefront orders also
  write the site's consent order meta (`nvm_storefront_consent_order_meta`,
  default `_tpc_research_updates`, plus `_at` and `_ip`), as its WordPress
  checkout field does.
- **Sign-up method (contract f1):**
  `NVM_Headless_Bridge::storefront_initiated_signup()` and
  `storefront_signup_method()` (`email`, `google` or `facebook`), set before
  the user is created. A storefront-started Google sign-in leaves a ten-minute
  `nvm_sf_signup` cookie for Wapu Auth's callback, cleared by the auth return.
- **`NVM_Marketing::open( $name )`** reads the cookie from the request when no
  value is passed. **`NVM_Marketing::write( $name, $data )`** seals and sets
  `pc_attr_first` / `pc_attr_last` the way the storefront does.
- **`me` rate limit:** `me` has its own per-IP ceiling (`ME_MAX`, 3000 a minute)
  and no longer spends the shared `TRUSTED_MAX` bucket.
- **One-time sign-in return:** once the storefront owns traffic, a shopper
  still signed in on WordPress is sent once through the auth return to the
  same storefront page, and arrives signed in. The `nvm_sf_returned` cookie
  marks it done; option `nvm_bridge_signed_in_return` = `no` turns it off.

## 2.7.4: the agency's endpoint questions (Q1, Q4, Q5, Q12)

From the endpoint-formats file of the Oct 6 reply.

- `me` runs `apply_filters('nvm_bridge_me_payload', $payload, $user_id, $request)`.
  Site plugins add keys beside `user` (the agency's `tpc`); `user` itself is
  put back after the filter, so an extension can never change who is signed in.
- `do_action('nvm_bridge_session_issued', int $user_id, string $via)` fires on
  every request that issues a storefront session: `signin`, `register`,
  `redeem-auth`, and Facebook (`signin` for a linked account, `register` for a
  new one). Storefront sign-in uses `wp_authenticate()`, which never fires
  `wp_login`. A listener that throws is logged and never fails the sign-in.
  The storefront now forwards the campaign cookie set and `Sec-GPC` on all of
  these calls, not only on `register`.
- Router redirects default to 302 instead of 301 until the rollback window has
  passed (the affiliate registration hop stays 303). The storefront's own
  redirects are 307 for the same reason.
- `NVM_Storefront_Router::target_for_path( $path_and_query, $lang )` and
  `target_for_request()`: path-based, callable at `init`. They return null for
  WordPress-owned addresses (checkout, order-pay and order-received under it,
  the account screens WordPress still renders, AffiliateWP pages, `wp-*`
  machinery, and WordPress sign-in, reset, `nvm-*` and `wapu_*` keys). Any
  other path is kept as it is, because the storefront owns the full old-address
  map. A Spanish path loses its `/es` prefix. Only `CARRY_QUERY` keys travel,
  whole or not at all. `target_for_request()` also keeps `redirect()`'s
  production-origin guard.
- The auth return accepts `lang` (for example `lang=es`) to choose the
  storefront. Only a language WPML runs counts; otherwise it uses the page's
  language as before. WordPress's own post-login hop now adds the current
  language.

## 2.7.3: the shopper on storefront orders

From the Oct 6 reply (checkout: "a Vercel IP on the order breaks matching").

- The Store API checkout takes an `nvm-shopper` extension, `{"ip", "user_agent"}`,
  and writes them into the order's own customer IP and user-agent fields, the
  ones the Stape webhook, capi-connector and the feeds read. Only on the
  storefront's own checkout (bridge key plus a valid customer session); the IP
  must be a valid address and the user agent is cut to 500 characters.
- The storefront now also forwards `_fbc`, `_fbp` and `__obref` on the order
  request, next to the attribution cookies, so tpc-tracking, tpc-oai-clicks and
  the Stape capture read them as on WordPress's own checkout.

## 2.7.2: restricted products from settings (task 9)

- `/nvm/v1/marketing/config` now carries `restricted`: the product slugs
  Microsoft's tag skips. Shipped list = the agency's six since Oct 5 (Tesamorelin,
  Ipamorelin + Tesamorelin, Oxytocin, Thymosin Alpha-1, GHRP-6, Sermorelin), English
  and Spanish slugs. The option `nvm_marketing_restricted_products` (an array of
  slugs) replaces it without a release. The storefront falls back to its own copy
  of the same list when an older bridge sends none.

## 2.7.1: privacy as today, pc_ref v2, old links (tasks 4, 6, 11)

From the client's Oct 6 files (GPC table, first-touch fixtures, URL lists).

- **Privacy is today's behaviour (task 11).** `NVM_Marketing::adopt()` does
  nothing unless the request carries a storefront cookie (`pc_attr_first`,
  `pc_attr_last`, `pc_ref`, `pc_marketing_optout`, `nvm_shared_optout`). GPC
  alone no longer writes `capi_optout`, and no attribution cookie
  (`tpc_attribution`, `tpc_last_touch`, `_fbc`, `tpc_ttclid`,
  `tgd_tracking_meta`) is ever deleted. Only the storefront's own "Do Not
  Sell or Share" choice (`pc_marketing_optout=1`) becomes `capi_optout`. The
  footer privacy script prints only once the storefront owns the traffic, so
  WordPress's pages are byte-identical until then.
- **The CAPI frame under GPC** keeps sending with `advertising:false`, as the
  live capi-connector does; the opt-out cookie still stops it.
- **`pc_ref` v2 (task 6).** `NVM_Marketing::open('pc_ref', …)` returns the
  shape the client proposed: `{"v":2,"first":{"ts","rh","path","q":{},"prior"},
  "up":[…at most 2]}`, every field bounded and `q` limited to tpc-tracking's 21
  allowlisted keys. A first-release cookie (`{"v":[{h,p,q,t}]}`) is read into
  the same shape.
- **The router (task 4)** carries `attribute_mg` (the feeds' strength
  preselect), `utm_id`, `gad_source`, `gad_campaignid` and `srsltid`. Click IDs
  are kept whole or dropped, up to 512 characters for `fbclid`/`ttclid`, 500
  for `oppref` and 256 for Google's. Two addresses WordPress itself 404s now
  reach the storefront: `/product/glp-3-r/` (a broadcast to ~6,800 people) and
  `/contact/` (a Google sitelink). As before, nothing is redirected while
  WordPress owns the traffic.

## 2.7.0: research declaration, Facebook sign-in

The storefront's sign-ups make the research declaration the WordPress gate
asks for, and "Continue with Facebook" (Meta Sign-In Handoff) gets its account
half. Both live in `includes/storefront-signup.php`.

- The declaration is a status from `TPC_Gate::STATUSES`, the 21+ researcher
  statement and the policies accepted. It is saved with the gate's own
  `TPC_Gate::save_declaration()` when the gate plugin is active, otherwise to
  the same user meta (`tpc_research_status`, `tpc_research_declared_at`,
  `tpc_research_decl_version`, `tpc_research_decl_source`,
  `tpc_research_decl_lang`), so the records are the same records. Sources:
  `storefront-register`, `storefront-google`, `storefront-step`,
  `gate-facebook`.
- `POST /register` takes `declaration` and saves it on the new account. A
  request without one is still accepted, for a storefront deployed before
  this version; the storefront itself now always sends it.
- `POST /me/declaration` (signed in): the declaration for an account that has
  none yet, once; a second call changes nothing.
- `POST /facebook-signin` (bridge key): the storefront verified the Facebook
  identity server-side and sends the id, name, email and, when it has them,
  the answers. A linked `tpc_fb_id` signs in. An email that already has an
  account answers `existing_email` and is never signed in this way. A missing
  email or declaration answers `need_more`. Otherwise the customer is created,
  linked, declared (`gate-facebook`) and signed in. No Facebook token or app
  secret ever reaches WordPress.

## 2.6.1: pc_ref, storefront sign-ups, initiate_checkout

For relaunch tasks 6, 7 and the storefront checkout.

- `NVM_Marketing::open('pc_ref', $value)` returns the visits list
  `{"v":[{"h":referrer host,"p":landing path,"q":campaign query,"t":unix}]}`
  (at most three, each field bounded). `pc_attr_*` open exactly as before.
- `rest_register` defines `NVM_STOREFRONT_SIGNUP` for that request only, so
  a `user_register` listener (the UET snippet) can leave Microsoft's sign_up to
  the storefront's marker. GA4's server-side sign_up is unaffected.
- The CAPI frame accepts `initiate_checkout` as well as page_view,
  view_content and add_to_cart: checkout now opens on the storefront.

## 2.6.0: encrypted attribution, tag IDs from settings

For the Next.js relaunch tracking tasks (10 and 12).

- `NVM_Marketing::open($name, $value)` and `seal($name, $data)` are the
  only way in to the storefront's attribution cookies (`pc_attr_first`,
  `pc_attr_last`, later `pc_ref`). They are AES-256-GCM:
  key = HKDF-SHA256(bridge secret, salt `pc-marketing`, info
  `pc-marketing-v2|<scope>`, 32), value = `v2.` + base64url(iv) + `.` +
  base64url(ciphertext + tag), with `<name>|<scope>` as associated data.
  The scope is the site's shared cookie domain (`peptidescollective.com`, or
  `devteam.peptidescollective.com` on the clone), so a staging cookie never
  opens on production. Each value is capped at 1536 bytes. The older signed
  (v1) value is still read during the switch.
- `marketing/config` reads the GA4, GTM and UET IDs from settings, not code:
  the constant `NVM_MARKETING_<KEY>_ID` in wp-config.php, else the option
  `nvm_marketing_<key>_id`, else the live ID. Staging sets its test IDs; a
  constant set to `''` switches that tag off. (The storefront also refuses
  live IDs on staging by itself.)

## 2.5.0: orders from the storefront's own checkout

For a storefront that takes the card payment itself (Tagada) on its own
checkout page. WooCommerce still makes every order, from the storefront's
Store API cart, through its own Store API checkout.

- The storefront server (bridge key) is admitted to `/wc/store/v1/checkout`
  as well as products and cart. Nobody else is.
- On that request, and only when it also carries a valid WordPress session in
  `X-NVM-Customer-Auth`, WooCommerce does not require registration, and a
  payment method "Card (storefront)" (`nvm_storefront_card`) is available.
  It takes nothing: it assigns the order to that customer, records the
  marketing opt-in (`_nvm_storefront_marketing_opt_in`) and leaves the order
  "Pending payment". The cart is kept until the payment succeeds. The method
  never appears on the WordPress checkout page.
- `POST /nvm/v1/checkout/complete` (`auth`, `order_id`, `order_key`,
  `payment_id`, `amount` in minor units, `currency`) marks the order paid
  with WooCommerce's own `payment_complete()`: status, paid date, transaction
  id, stock, emails and every payment hook. The amount must equal the order
  total. Repeating it with the same payment answers as before; a different
  payment for a paid order is refused.
- `POST /nvm/v1/checkout/fail` marks the order failed after a declined card.
- Both answer 404 for an order that is not the customer's, has another key or
  was not placed through the storefront card method.

## 2.3.2: cookie identity, and nothing before the cutover

Built for a site whose session handler keys carts on its own signed cookie
(`tpc_cid`) rather than on the Store API Cart-Token. The Cart-Token path is
unchanged for every other store.

- `handoff-code` accepts `identity: { cid, wcs }`, the shopper's `tpc_cid`
  value and optional `wp_woocommerce_session_*` pair, in place of or alongside
  `cart_token`. At redemption the core sets those two cookies on the browser
  with the attributes the site uses (path `/`, host-only, Secure, HttpOnly,
  SameSite=Lax; thirty days and forty-eight hours), sets the auth cookie for a
  member, and redirects to checkout. It does not touch the WooCommerce session
  on that request. The 120 s single-use code, the origin binding and the
  `Sec-Fetch-Dest: document` gate are as before.
- `nvm-cart-return` reads the returning browser's `tpc_cid` and session
  cookies and carries them in the adopt code; `redeem-code` answers with
  `identity: { cid, wcs }` as exact `name=value` pairs, or `null` on stores
  that key on the token. `cart_token` is `null` when the handler reported no
  session.
- Nothing customer-visible changes while WordPress owns traffic. The
  `wp_robots` and `robots_txt` filters and the attribute reordering on
  `woocommerce_product_read_attribute` are only added once Next.js owns
  traffic; `nvm-auth-return` does nothing when no storefront is configured.
- `http://localhost:3000` joins the origin allowlist only when wp-config.php
  defines `NVM_BRIDGE_DEV_ORIGINS`.
- The `rest_post_dispatch` no-store header is limited to `/nvm/v1/` and the
  Store API cart routes. Product reads are cacheable again.
- Path defaults: `contact` is `/contact-us`, `account_addresses` is
  `/account/addresses`, and `legal_privacy`, `legal_terms`, `legal_shipping`
  (`/privacy-policy`, `/terms-and-conditions`, `/shipping-returns-policy`)
  feed the page map for the WordPress legal pages. `lost_password` and
  `reset_password` name the same routes as `account_lost_password` and
  `account_reset_password`.

Traffic owner still defaults to WordPress and the checkout skin still defaults
to off.

## 2.3.1: paying an order the account already owns

WooCommerce grants `pay_for_order` only to the logged-in owner of an
account-attached order; the order key alone is enough for a guest order and is
not enough for that one. A storefront customer holds a session on the frontend
and no WordPress cookies, so a storefront that creates the order itself and then
sends the browser to `order-pay` meets a WordPress login form for an account the
customer is already signed in to.

`handoff-code` therefore accepts an optional `pay_order_id`. It is bound into
the single-use code by the frontend server rather than read from the redemption
URL, so whoever opens the link cannot swap the order being paid, and it is
refused unless the handoff also carries `auth` — a guest order needs no session
to pay for. Ownership is checked when the code is minted and again at
redemption, against the session that was actually established, so a code that
outlives its order, or an order since paid or reassigned, falls through to the
ordinary target instead. The pay URL comes from `WC_Order` itself, so the order
key is never carried by this plugin.

Storefronts that do not send `pay_order_id` are unaffected: the handoff lands on
the same target it always did.

## 2.3.0: portable across storefronts

- Every frontend path the core could send a browser to moved out of the three
  files that held them and into the contract above. Defaults are unchanged, so
  an existing deployment upgrades without configuring anything.
- The checkout skin's footnote is empty by default. A compliance line belongs
  to the shop that is required to display it, not to every shop sharing this
  core; set `footnote` through the `nvm_checkout_skin_brand` option or filter.
- `PRODUCTION_FRONTEND` no longer names a particular project. It stays empty on
  purpose: `frontend_urls()` filters empty entries out of the origin allowlist,
  so an unconfigured install accepts local development and nothing else.
- `site_plugin_version` in the health response no longer names one project's
  companion plugin class. It reads `nvm_bridge_site_plugin_version`, which is
  null unless a site supplies it, so the response shape is unchanged:

      add_filter('nvm_bridge_site_plugin_version', fn () => My_Commerce::VERSION);

- The maintenance holding page carried a specific shop's colours and webfont.
  Its palette is now neutral, matching the checkout skin's own neutral tokens,
  and a site applies its brand through `nvm_maintenance_tokens` (keys: `page`,
  `ink`, `ink-rgb`, `mark-bg`, `mark-fg`, `rule`, `font`). Markup and copy are
  unchanged.

Customer-facing WordPress pages redirect only when **Next.js owns customer
traffic** is enabled. The option defaults to WordPress ownership, so installing
or upgrading the core never performs a storefront cutover by itself. Enabled
storefront redirects use HTTP 301 because Next.js ownership is a permanent SEO
cutover.

## 2.2.1: consistent account cart recovery

- The account recovery count now describes the token's session. An existing
  empty session never falls back to stale persistent-cart metadata.
- Only a missing account session can restore saved items. WooCommerce validates
  products and calculates the recovered cart. A conditional database insert
  persists it before issuing the token; a concurrent session or changed saved
  source causes a retryable 503 instead of an overwrite.
- Unreadable session data and database failures remain unavailable. No new
  service or endpoint fields are required. Existing frontends remain supported.
- The matching Next.js change adds one confirmation read for a residual
  count/token contradiction. It preserves the basket if the contradiction lasts.

## 2.2.0: cart return continuity

- The existing checkout handoff gains optional `cart_return_version: 2` and
  `cart_return_binding` fields. Next.js supplies an opaque HMAC of its browser
  cart identity, HttpOnly mutation revision and auth credential. The core carries
  this proof through both handoff legs and the single-use adoption code.
- The core records the order created during that checkout. A v2 return can
  report completion only after the matching order's user, receipt key and
  permitted order status are verified. An unrelated old receipt cannot complete
  the current checkout context.
- Next.js compares the returned proof with its current cookies before replacing
  any held basket. A completed return still requires a successful incoming cart
  read confirming zero. Failed reads preserve the basket and mark its display
  for reconciliation.
- Checkout and adoption codes now use the database-backed atomic record store
  already used by auth. Codes minted as transients by the previous core remain
  redeemable during their 120-second lifetime through a unique database claim.
  No new storage service is required.

### Compatibility and rollback

The prior auth release is core **2.1.0**. Core **2.2.0** retains its legacy and
v2 checkout/auth contracts: older frontends omit the new cart-return fields and
continue receiving the existing `cart_token` and `order_completed` response
fields. Rolling Vercel back to that frontend does not require downgrading core.

The updated frontend also accepts checkout URLs from a bridge without the new
fields. On the return, an upgraded browser keeps its token when basket-bound
proof is absent and forces ordinary cart/account reconciliation. It does not
treat an unbound completed-order flag as permission to replace the basket.
Full basket-bound return behavior therefore requires core 2.2.0; the absence
of support must not enable a cached checkout-return shortcut.

Downgrading the WordPress plugin is a separate operation. Core 2.1.0 cannot read
new atomic checkout codes minted by 2.2.0. A handoff already in progress may need
to be restarted during the 120-second code window. WooCommerce retains its
cart/session data. Do not confuse this with the supported frontend rollback.

### Local verification and limits

- `tests/cart-return.test.js` exercises the actual Next.js route handlers with
  mocked bridge responses: matching completion, newer mutation/basket/account,
  failed reads, forged query flags, replay refusal, and legacy bridge fallback.
- `tests/php/cart-return-test.php` executes the shipped PHP helpers inside
  Docker. It covers interleaved atomic consumers, legacy transient claims,
  storage failure, old callers, and created-order/receipt matching.
- These compatibility tests exercise the legacy wire contract. They do not
  claim a full deployment test with the previous plugin binary installed.

The basket proof checks the cookies present when a return request starts. It
rejects a late old return after the browser has received a newer mutation
revision; it is not a distributed compare-and-swap operation. Completely
concurrent requests can still produce out-of-order cookie responses, and
cross-device writes remain WooCommerce's responsibility. Browser coordination
and reconciliation are still required.

Build the supported packages with `npm run build:plugins`. The output manifest
under `dist/wordpress/` records versions and SHA-256 hashes. Build and local
verification do not deploy or modify a live WordPress installation.
