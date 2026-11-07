<?php
/**
 * Plugin Name:       NVM Headless Core
 * Description:       Shared identity, cart, checkout handoff and redirect protocol for a headless WooCommerce storefront.
 * Version:           2.7.6
 * Author:            NVM Commerce
 * Requires at least: 6.2
 * Requires PHP:      8.0
 *
 * Nothing here copies, rebuilds or mirrors a cart. The headless frontend and
 * WooCommerce always share one wp_woocommerce_sessions row; this plugin only
 * moves the *identity* of that session between the two, using single use codes
 * so no long lived credential ever appears in a URL.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Headless_Bridge
{
    const VERSION      = '2.7.6';
    const RETURN_PREFIX = 'nvm_ret_';
    const RETURN_COOKIE = 'nvm_bridge_return';
    const REST_NS      = 'nvm/v1';
    const CODE_TTL     = 120;
    const CODE_PREFIX  = 'nvm_hc_';
    const AUTH_RECORD_PREFIX = 'nvm_auth_once_';
    const OPT_SECRET   = 'nvm_bridge_secret';
    const OPT_FRONTEND = 'nvm_bridge_frontend_url';
    const OPT_PATHS    = 'nvm_bridge_paths';
    const OPT_ENABLED  = 'nvm_bridge_enabled';
    const OPT_TRAFFIC_OWNER = 'nvm_bridge_traffic_owner';
    const OPT_LOCALE_ORIGINS = 'nvm_bridge_locale_origins';
    const OPT_RECEIPT_ACTIONS = 'nvm_bridge_receipt_actions';
    const OPT_RECEIPT_PRIMARY_LABEL = 'nvm_bridge_receipt_primary_label';
    const OPT_RECEIPT_PRIMARY_PATH = 'nvm_bridge_receipt_primary_path';
    const OPT_RECEIPT_SECONDARY_LABEL = 'nvm_bridge_receipt_secondary_label';
    const OPT_RECEIPT_SECONDARY_PATH = 'nvm_bridge_receipt_secondary_path';
    /*
     * SET THIS BEFORE DEPLOYING, or leave it blank. A storefront that has
     * not deployed yet is safer blank than guessed:
     * frontend_urls() maps each entry through origin_from_url() and
     * array_filter()s the result, so '' simply does not join the allowlist.
     * The bridge therefore accepts local development and nothing else, which
     * fails closed.
     *
     * Guessing a hostname here would be worse than leaving it blank — this
     * constant is one of the two things standing between the handoff and a
     * session-fixation request from somewhere else.
     *
     * When the storefront deploys, prefer the option so no redeploy is needed:
     *   update_option('nvm_bridge_frontend_url', 'https://<host>');
     */
    const PRODUCTION_FRONTEND = '';

    /* Development only, and only when wp-config.php defines
     * NVM_BRIDGE_DEV_ORIGINS. Production and preview origins belong in
     * settings; a live site must not accept a handoff from localhost. */
    const LOCAL_FRONTEND = 'http://localhost:3000';
    const RATE_MAX     = 30;
    const TRUSTED_MAX  = 600;
    // `me` alone, per storefront IP per minute: wide, but still stops a runaway loop.
    const ME_MAX       = 3000;
    const RATE_WINDOW  = 60;

    /*
     * Cookie identity. On a site whose session handler keys carts on a signed
     * cookie rather than on the Store API Cart-Token, the handoff carries the
     * browser's cookie values instead of a token and sets them back on the
     * browser at redemption. The names and lifetimes below are the ones the
     * site's own handler uses: `tpc_cid` for thirty days, host-only, and the
     * WooCommerce session cookie for its usual forty-eight hours.
     */
    const IDENTITY_CID_COOKIE     = 'tpc_cid';
    const IDENTITY_CID_TTL        = 30 * DAY_IN_SECONDS;
    const IDENTITY_SESSION_PREFIX = 'wp_woocommerce_session_';
    const IDENTITY_MAX_LENGTH     = 4096;

    /** True only while a password reset email is being generated. */
    private static $sending_reset_email = false;

    public static function is_enabled(): bool
    {
        return (bool) apply_filters(
            'nvm_bridge_enabled',
            'no' !== get_option(self::OPT_ENABLED, 'yes')
        );
    }

    /** Public WordPress pages redirect only after this explicit cutover. */
    public static function nextjs_owns_traffic(): bool
    {
        return 'nextjs' === get_option(self::OPT_TRAFFIC_OWNER, 'wordpress');
    }

    /** WooCommerce is the single source of truth for guest checkout policy. */
    public static function checkout_account_required(): bool
    {
        return (bool) apply_filters(
            'woocommerce_checkout_registration_required',
            'yes' !== get_option('woocommerce_enable_guest_checkout', 'yes')
        );
    }

    /** Independent storefront browsing policy, read by Next.js on each visit. */
    public static function storefront_login_required(): bool
    {
        return 'yes' === get_option('nvm_bridge_storefront_login_required', 'no');
    }

    public static function receipt_actions_enabled(): bool
    {
        return 'yes' === get_option(self::OPT_RECEIPT_ACTIONS, 'no');
    }

    public static function receipt_action_defaults(): array
    {
        return array(
            'primary_label'   => 'Continue shopping',
            'primary_path'    => self::path('shop'),
            'secondary_label' => 'View your order',
            'secondary_path'  => self::path('account_order'),
        );
    }

    public static function receipt_action_settings(): array
    {
        $defaults = self::receipt_action_defaults();
        $settings = array(
            'primary_label'   => sanitize_text_field((string) get_option(self::OPT_RECEIPT_PRIMARY_LABEL, $defaults['primary_label'])),
            'primary_path'    => self::safe_path(get_option(self::OPT_RECEIPT_PRIMARY_PATH, $defaults['primary_path'])),
            'secondary_label' => sanitize_text_field((string) get_option(self::OPT_RECEIPT_SECONDARY_LABEL, $defaults['secondary_label'])),
            'secondary_path'  => self::safe_path(get_option(self::OPT_RECEIPT_SECONDARY_PATH, $defaults['secondary_path'])),
        );

        foreach ($defaults as $key => $default) {
            if ('' === $settings[$key]) {
                $settings[$key] = $default;
            }
        }

        return $settings;
    }

    public static function boot(): void
    {
        require_once __DIR__ . '/includes/admin-settings.php';
        NVM_Bridge_Admin::boot();
        require_once __DIR__ . '/includes/access-policy-sync.php';
        NVM_Access_Policy_Sync::boot();

        if (!self::is_enabled()) {
            return;
        }

        // A Google sign-in the storefront started (2.7.5, the agency's f1 contract).
        add_action('init', array(self::class, 'note_google_signup'), 0);

        // One switch for the whole shop: closes cart, checkout and account here,
        // and publishes the answer at /wp-json/nvm/v1/status so the storefront's
        // proxy closes its side from the same tick box.
        require_once __DIR__ . '/includes/maintenance.php';
        NVM_Maintenance::boot();

        // The checkout and order-received skin. A separate file because it is a
        // presentation concern with its own tokens, and this one is long enough.
        require_once __DIR__ . '/includes/checkout-skin.php';
        NVM_Checkout_Skin::boot();

        // The free-shipping threshold, read from the shipping zones themselves.
        // WooCommerce owns the number so the storefront never has to be told it
        // twice.
        require_once __DIR__ . '/includes/shipping-rules.php';
        NVM_Shipping_Rules::boot();

        require_once __DIR__ . '/includes/account-cart.php';
        NVM_Account_Cart::boot();
        require_once __DIR__ . '/includes/catalog.php';
        NVM_Catalog::boot();

        // The storefront server reads the catalogue and carts through the
        // store's access gate; nobody else gets through.
        require_once __DIR__ . '/includes/storefront-server-access.php';
        NVM_Storefront_Server_Access::boot();

        // Orders from the storefront's own checkout: WooCommerce makes them,
        // the storefront takes the card payment and reports it back.
        require_once __DIR__ . '/includes/storefront-checkout.php';
        NVM_Storefront_Checkout::boot();

        // Sign-ups started on the storefront: the research declaration and
        // "Continue with Facebook".
        require_once __DIR__ . '/includes/storefront-signup.php';
        NVM_Storefront_Signup::boot();

        require_once __DIR__ . '/includes/storefront-router.php';
        NVM_Storefront_Router::boot();

        require_once __DIR__ . '/includes/affiliate-navigation.php';
        NVM_Affiliate_Navigation::boot();
        require_once __DIR__ . '/includes/affiliate-account.php';
        require_once __DIR__ . '/includes/marketing.php';
        NVM_Affiliate_Account::boot();

        add_action('rest_api_init', array(self::class, 'register_routes'));
        add_action('wp_loaded', array(self::class, 'handle_navigation_endpoints'), 5);
        add_action('template_redirect', array(self::class, 'enforce_nocache_on_store_pages'));
        add_filter('rest_post_dispatch', array(self::class, 'enforce_nocache_on_store_api'), 10, 3);
        add_filter('woocommerce_login_redirect', array(self::class, 'after_login_redirect'), 10, 1);
        add_filter('woocommerce_registration_redirect', array(self::class, 'after_login_redirect'), 10, 1);
        add_action('woocommerce_thankyou', array(self::class, 'mark_completed_order_return'), 1);
        add_action('woocommerce_checkout_order_processed', array(self::class, 'bind_checkout_order_return'), 1);
        add_action('woocommerce_store_api_checkout_order_processed', array(self::class, 'bind_checkout_order_return'), 1);

        // Reordering attribute options changes what WordPress's own product
        // pages render, so it waits for the cutover like every other change a
        // live visitor could see.
        if (self::nextjs_owns_traffic()) {
            add_filter('woocommerce_product_read_attribute', array(self::class, 'order_attribute_options'), 10, 1);
        }

        // The reset email's link is pointed at the storefront, but only for as
        // long as that email is being generated. See reset_password_endpoint_url().
        add_action('woocommerce_reset_password_notification', array(self::class, 'begin_reset_email'), 1);
        add_action('woocommerce_reset_password_notification', array(self::class, 'end_reset_email'), PHP_INT_MAX);
        add_filter('woocommerce_get_endpoint_url', array(self::class, 'reset_password_endpoint_url'), 10, 2);
    }

    /**
     * Apply the shop owner's term order to product attributes.
     *
     * WooCommerce records that order in order_{taxonomy} term meta, but the
     * product read path pulls options through get_the_terms(), which sorts by
     * name. A vial size attribute therefore reaches the Store API as
     * "10mg, 15mg, 5mg" and the storefront renders its selector in that order.
     * Reordering as the product is read fixes every consumer at once, and is a
     * no-op for attributes not configured to sort by menu order.
     *
     * @param WC_Product_Attribute $attribute Attribute being read.
     * @return WC_Product_Attribute
     */
    public static function order_attribute_options($attribute)
    {
        if (!($attribute instanceof WC_Product_Attribute) || !$attribute->is_taxonomy()) {
            return $attribute;
        }

        $taxonomy = $attribute->get_name();
        $options  = $attribute->get_options();

        if (count($options) < 2 || 'menu_order' !== wc_attribute_orderby($taxonomy)) {
            return $attribute;
        }

        $key    = 'order_' . $taxonomy;
        $ranked = array();

        foreach ($options as $i => $term_id) {
            $order    = get_term_meta((int) $term_id, $key, true);
            $ranked[] = array('' === $order ? PHP_INT_MAX : (int) $order, $i, $term_id);
        }

        // Ties keep their incoming order, so unordered terms stay put rather
        // than shuffling between requests.
        usort($ranked, static function (array $a, array $b): int {
            return $a[0] === $b[0] ? $a[1] <=> $b[1] : $a[0] <=> $b[0];
        });

        $attribute->set_options(array_column($ranked, 2));

        return $attribute;
    }

    /* ------------------------------------------------------------------ config */

    public static function frontend_url(): string
    {
        $url = defined('NVM_BRIDGE_FRONTEND_URL')
            ? NVM_BRIDGE_FRONTEND_URL
            : get_option(self::OPT_FRONTEND, self::PRODUCTION_FRONTEND);

        return untrailingslashit((string) apply_filters('nvm_bridge_frontend_url', $url));
    }

    /**
     * The storefront's URL contract.
     *
     * Every frontend path the core can send a browser to lives here, so moving
     * it to another storefront is a settings change rather than a search
     * through three files. The defaults describe the layout this core grew up
     * against; a storefront that publishes any of them elsewhere overrides
     * just those keys, through the OPT_PATHS option or the matching filter.
     *
     * Braced tokens are filled in by path(). A default left un-replaced, such
     * as {order_id} in a receipt link, is substituted later by its caller.
     */
    public static function path_defaults(): array
    {
        return array(
            'home'                   => '/',
            'shop'                   => '/shop',
            'product'                => '/product/{slug}',
            'cart'                   => '/cart',
            'contact'                => '/contact-us',

            'account'                => '/account',
            'account_orders'         => '/account/orders',
            'account_order'          => '/account/orders/{order_id}',
            'account_downloads'      => '/account/downloads',
            'account_addresses'      => '/account/addresses',
            'account_details'        => '/account/details',
            'account_payment'        => '/account/payment-methods',
            'account_lost_password'  => '/account/lost-password',
            'account_reset_password' => '/account/reset-password',
            // The same two routes under the names the integration contract uses.
            'lost_password'          => '/account/lost-password',
            'reset_password'         => '/account/reset-password',

            'legal_privacy'          => '/privacy-policy',
            'legal_terms'            => '/terms-and-conditions',
            'legal_shipping'         => '/shipping-returns-policy',

            'api_checkout'           => '/api/checkout',
            'api_checkout_confirm'   => '/api/checkout-confirm',
            'api_cart_adopt'         => '/api/cart/adopt',
            'api_auth_begin'         => '/api/auth/begin',
            'api_auth_callback'      => '/api/auth/callback',
        );
    }

    /** The resolved contract: shipped defaults, then site overrides. */
    public static function paths(): array
    {
        $defaults = self::path_defaults();
        $stored   = get_option(self::OPT_PATHS, array());
        $paths    = array_merge($defaults, is_array($stored) ? $stored : array());
        $paths    = apply_filters('nvm_bridge_paths', $paths);

        if (!is_array($paths)) {
            return $defaults;
        }

        /* An override that is not a usable path is a misconfiguration, not a
         * licence to emit a redirect somewhere else. safe_path() rejects
         * absolute and protocol-relative values, so a bad entry here falls
         * back to the shipped default instead of leaving the storefront. */
        foreach ($defaults as $key => $default) {
            $candidate = isset($paths[$key]) ? self::safe_path($paths[$key]) : '';

            $paths[$key] = '' === $candidate ? $default : $candidate;
        }

        return $paths;
    }

    /**
     * One storefront path, with any {tokens} the caller supplies filled in.
     *
     * Unknown keys fall back to the shipped default and then to '/', so a
     * typo cannot produce an empty Location header. Replacement values are
     * inserted verbatim: pass URL-safe segments.
     */
    public static function path(string $key, array $replacements = array()): string
    {
        $paths = self::paths();
        $path  = (string) ($paths[$key] ?? '');

        if ('' === $path) {
            $defaults = self::path_defaults();
            $path     = (string) ($defaults[$key] ?? '/');
        }

        foreach ($replacements as $token => $value) {
            /* Callers pass segments that are already URL-safe: sanitize_title()
             * for a slug, absint() for an id. Encoding again here would turn a
             * slug sanitize_title() had already percent-escaped into a
             * double-escaped one, so only the newline pair that could forge a
             * Location header is stripped. */
            $value = str_replace(array("
", "
"), '', (string) $value);
            $path  = str_replace('{' . $token . '}', $value, $path);
        }

        return $path;
    }

    /** A safe cross-host production fallback, never localhost or plain HTTP. */
    public static function production_origin_ready(): bool
    {
        /* Inspect the configured fallback, not the request-scoped handoff
         * origin supplied by nvm_bridge_frontend_url filters. */
        $frontend = defined('NVM_BRIDGE_FRONTEND_URL')
            ? NVM_BRIDGE_FRONTEND_URL
            : get_option(self::OPT_FRONTEND, self::PRODUCTION_FRONTEND);
        $parts    = wp_parse_url($frontend);

        if (!is_array($parts) || 'https' !== strtolower((string) ($parts['scheme'] ?? ''))) {
            return false;
        }

        $host      = strtolower((string) ($parts['host'] ?? ''));
        $shop_host = strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST));

        return '' !== $host
            && !in_array($host, array('localhost', '127.0.0.1', '::1'), true)
            && $host !== $shop_host;
    }

    /** Exact storefront origins permitted to initiate a browser handoff. */
    /**
     * The storefront that serves a language, or the configured default.
     *
     * A site with one storefront per language cannot be served by a single
     * configured origin: a Spanish shopper returned to the English host arrives
     * at a page in the wrong language, and - because the cart cookie is
     * host-only - without their basket. The map is the site's own answer to
     * "who serves Spanish", so redirects, checkout returns and sign-ins can all
     * ask the same question instead of each guessing.
     *
     * An origin is honoured only when the allowlist already contains it, so a
     * mistyped map degrades to the default rather than sending a customer
     * somewhere this bridge does not trust.
     */
    public static function origin_for_locale(string $locale): string
    {
        $configured = self::origin_from_url(self::frontend_url());
        $locale     = self::known_locale($locale);

        if ('' === $locale) {
            return $configured;
        }

        $map = get_option(self::OPT_LOCALE_ORIGINS, array());
        $map = apply_filters('nvm_bridge_locale_origins', is_array($map) ? $map : array());

        if (!is_array($map) || !isset($map[$locale])) {
            return $configured;
        }

        $origin = self::origin_from_url((string) $map[$locale]);

        return ($origin && in_array($origin, self::frontend_urls(), true)) ? $origin : $configured;
    }

    /**
     * A language code this site actually runs, or an empty string.
     *
     * Everything downstream treats '' as "no opinion" and falls back to the
     * site default, so an unknown or hostile value can never switch a customer
     * into a language that does not exist or bind them to a stray origin.
     */
    public static function known_locale($locale): string
    {
        $locale = strtolower((string) $locale);

        if (!preg_match('/\A[a-z]{2}(?:[_-][a-z0-9]{2,8})?\z/', $locale)) {
            return '';
        }

        $languages = apply_filters('wpml_active_languages', null, array('skip_missing' => 0));

        if (!is_array($languages) || !$languages) {
            return '';
        }

        return isset($languages[$locale]) ? $locale : '';
    }

    public static function frontend_urls(): array
    {
        $urls = array(
            self::PRODUCTION_FRONTEND,
            self::frontend_url(),
        );

        if (defined('NVM_BRIDGE_DEV_ORIGINS')) {
            $urls[] = self::LOCAL_FRONTEND;
        }

        $urls = apply_filters('nvm_bridge_frontend_urls', $urls);

        return array_values(array_unique(array_filter(array_map(
            array(self::class, 'origin_from_url'),
            is_array($urls) ? $urls : array()
        ))));
    }

    /** Normalize a configured URL to its scheme, host and non-default port. */
    private static function origin_from_url($url): string
    {
        $parts = wp_parse_url((string) $url);

        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host   = strtolower((string) ($parts['host'] ?? ''));

        if (!in_array($scheme, array('http', 'https'), true) || '' === $host) {
            return '';
        }

        $default_port = 'https' === $scheme ? 443 : 80;
        $port         = (int) ($parts['port'] ?? $default_port);

        return $scheme . '://' . $host . ($port === $default_port ? '' : ':' . $port);
    }

    /** Shared key so only our own frontend server can mint or redeem codes. */
    public static function secret(): string
    {
        $secret = get_option(self::OPT_SECRET, '');

        if (!is_string($secret) || strlen($secret) < 32) {
            $secret = bin2hex(random_bytes(32));
            update_option(self::OPT_SECRET, $secret, false);
        }

        return $secret;
    }

    /* ------------------------------------------------------- single use codes */

    /** Short-lived, single-use referral navigation, separate from auth/cart codes. */
    public static function affiliate_user(WP_REST_Request $request) { return self::require_user($request); }

    public static function affiliate_portal_code(string $auth): string {
        return self::mint_auth_record('affiliate-portal', array('auth' => $auth));
    }

    public static function affiliate_portal_session(string $code): int {
        $data = self::consume_auth_record($code, 'affiliate-portal');
        $auth = is_array($data) ? (string) ($data['auth'] ?? '') : '';
        $uid = self::user_from_auth($auth);
        if (!$uid || !function_exists('affwp_get_affiliate_id') || 'active' !== affwp_get_affiliate_status(affwp_get_affiliate_id($uid))) return 0;
        $cookie = wp_parse_auth_cookie($auth, 'logged_in');
        return self::authenticate_browser($uid, (string) ($cookie['token'] ?? '')) ? $uid : 0;
    }

    public static function mint_affiliate_navigation(array $data): string
    {
        return self::mint_auth_record('affiliate-navigation', $data);
    }

    public static function consume_affiliate_navigation(string $code): ?array
    {
        return self::consume_auth_record($code, 'affiliate-navigation');
    }

    private static function mint_code(string $customer_id, string $purpose, array $extra = array()): string
    {
        $data = array_merge(array('cid' => $customer_id, 'p' => $purpose), $extra);
        return self::mint_auth_record('cart-' . $purpose, $data);
    }

    /** Reads and immediately destroys the code, so it can only ever be used once. */
    private static function consume_code_data(string $code, string $purpose): ?array
    {
        if (!preg_match('/\A[a-f0-9]{48}\z/D', $code)) {
            return null;
        }

        $data = self::consume_auth_record($code, 'cart-' . $purpose);
        if (is_array($data)) return $data;

        // Preserve the 120-second window for codes minted by the previous core.
        // A unique DB claim elects one reader even when transients use an object
        // cache. New records use the conditional-delete path above exclusively.
        $key  = self::CODE_PREFIX . hash('sha256', $code);
        $data = get_transient($key);
        if (!is_array($data) || ($data['p'] ?? '') !== $purpose || empty($data['cid'])) {
            return null;
        }

        global $wpdb;
        $claimed = $wpdb->insert($wpdb->options, array(
            'option_name' => self::AUTH_RECORD_PREFIX . hash('sha256', 'legacy-cart:' . $code),
            'option_value' => (time() + self::CODE_TTL) . '|{}',
            'autoload' => 'no',
        ), array('%s', '%s', '%s'));
        if (1 !== $claimed) return null;
        delete_transient($key);

        return $data;
    }

    private static function consume_code(string $code, string $purpose): ?string
    {
        $data = self::consume_code_data($code, $purpose);

        return $data ? (string) $data['cid'] : null;
    }

    /** Return the exact allowed storefront origin in the browser referrer. */
    private static function frontend_from_referrer(): string
    {
        $origin = self::origin_from_url((string) ($_SERVER['HTTP_REFERER'] ?? ''));

        return in_array($origin, self::frontend_urls(), true) ? $origin : '';
    }

    /**
     * Decide the storefront origin a checkout handoff returns to.
     *
     * A pure function of its inputs so the decision can be reasoned about and
     * tested on its own: both origins are expected already normalised by
     * origin_from_url(), and $allowed is frontend_urls(). The order is the whole
     * point of the Referer-independent handoff — the origin bound into the code
     * at mint time is preferred, and the Referer is only a fallback for codes
     * that predate that binding. Neither is returned unless it is on the
     * allowlist, so an unrecognised value can only ever be refused, never
     * followed; the allowlist is not widened here.
     *
     * @param string   $bound   Origin carried by the redeemed code, or ''.
     * @param string   $referer Origin derived from the browser Referer, or ''.
     * @param string[] $allowed Exact origins permitted to receive a handoff.
     */
    public static function resolve_return_origin(string $bound, string $referer, array $allowed): string
    {
        if ('' !== $bound && in_array($bound, $allowed, true)) {
            return $bound;
        }

        if ('' !== $referer && in_array($referer, $allowed, true)) {
            return $referer;
        }

        return '';
    }

    /**
     * Only ever accept a same site relative path. Blocks open redirects such as
     * //evil.com and /\\evil.com, which browsers treat as absolute URLs.
     */
    public static function safe_path($path): string
    {
        $path = trim((string) $path);

        if ('' === $path || '/' !== $path[0]) {
            return '';
        }

        if (isset($path[1]) && ('/' === $path[1] || '\\' === $path[1])) {
            return '';
        }

        if (preg_match('/[\r\n]/', $path)) {
            return '';
        }

        return $path;
    }

    /* --------------------------------------------------------- rate limiting */

    private static function client_ip(): string
    {
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($parts[0]);
        }

        return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    }

    private static function rate_limited(string $bucket, ?int $max = null): bool
    {
        $max   = $max ?? self::RATE_MAX;
        $key   = 'nvm_rl_' . $bucket . '_' . md5(self::client_ip());
        $count = (int) get_transient($key);

        if ($count >= $max) {
            return true;
        }

        set_transient($key, $count + 1, self::RATE_WINDOW);

        return false;
    }

    /* ------------------------------------------------------------ rest routes */

    public static function register_routes(): void
    {
        register_rest_route(self::REST_NS, '/handoff-code', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_handoff_code'),
            'permission_callback' => array(self::class, 'rest_permission'),
            'args'                => array(
                'cart_token'                => array('type' => 'string', 'required' => false),
                'identity'                  => array(
                    'type'       => 'object',
                    'required'   => false,
                    'properties' => array(
                        'cid' => array('type' => 'string'),
                        'wcs' => array('type' => array('string', 'null')),
                    ),
                ),
                'auth'                      => array('type' => 'string', 'required' => false),
                'auth_return_version'       => array('type' => 'integer', 'required' => false),
                'checkout_handoff_version'  => array('type' => 'integer', 'required' => false),
                'checkout_state_hash'       => array('type' => 'string', 'required' => false),
                'cart_return_version'       => array('type' => 'integer', 'required' => false),
                'cart_return_binding'       => array('type' => 'string', 'required' => false),
                'pay_order_id'              => array('type' => 'integer', 'required' => false),
            ),
        ));

        register_rest_route(self::REST_NS, '/confirm-handoff', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_confirm_handoff'),
            'permission_callback' => array(self::class, 'rest_permission'),
            'args'                => array(
                'intent' => array('type' => 'string', 'required' => true),
                'state'  => array('type' => 'string', 'required' => true),
            ),
        ));

        // Every route is POST and gated on the bridge key. The public-facing
        // flows are pre-auth by nature, so instead of a session they carry a
        // per-subject throttle inside the handler.
        foreach (array(
            'health'                    => 'rest_health',
            'redeem-auth'               => 'rest_redeem_auth',
            'track-order'               => 'rest_track_order',
            'me'                        => 'rest_me',
            'me/update'                 => 'rest_my_update',
            'me/orders'                 => 'rest_my_orders',
            'me/order'                  => 'rest_my_order',
            'me/addresses'              => 'rest_my_addresses',
            'me/address'                => 'rest_my_address',
            'me/downloads'              => 'rest_my_downloads',
            'me/payment-methods'        => 'rest_my_payment_methods',
            'me/payment-method/delete'  => 'rest_my_payment_method_delete',
            'me/payment-method/default' => 'rest_my_payment_method_default',
            'me/password'               => 'rest_my_password',
            'logout'                    => 'rest_logout',
            'signin'                    => 'rest_signin',
            'register'                  => 'rest_register',
            'lost-password'             => 'rest_lost_password',
            'reset-password'            => 'rest_reset_password',
        ) as $route => $callback) {
            register_rest_route(self::REST_NS, '/' . $route, array(
                'methods'             => 'POST',
                'callback'            => array(self::class, $callback),
                'permission_callback' => array(self::class, 'rest_permission'),
            ));
        }

        register_rest_route(self::REST_NS, '/redeem-code', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_redeem_code'),
            'permission_callback' => array(self::class, 'rest_permission'),
            'args'                => array(
                'code' => array('type' => 'string', 'required' => true),
            ),
        ));
    }

    public static function rest_permission(WP_REST_Request $request)
    {
        $provided = (string) $request->get_header('x-nvm-bridge-key');

        if ('' === $provided || !hash_equals(self::secret(), $provided)) {
            // Unauthenticated attempts are the brute force surface. Throttle hard.
            self::rate_limited('bridge-auth');

            return new WP_Error('nvm_forbidden', 'Invalid bridge key.', array('status' => 403));
        }

        // Authenticated calls all arrive from the storefront server, so they share
        // a single IP. A tight per IP limit here would throttle the entire shop
        // once it got busy. Keep only a high ceiling to catch a runaway loop.
        // `me` is read-only and runs for every signed-in page, so it has its own,
        // wider ceiling and never spends the shared one (2.7.5, the agency's
        // Oct 12 reply).
        if ('/' . self::REST_NS . '/me' === $request->get_route()) {
            return self::rate_limited('bridge-me', self::ME_MAX)
                ? new WP_Error('nvm_rate_limited', 'Too many requests.', array('status' => 429))
                : true;
        }
        if (self::rate_limited('bridge-trusted', self::TRUSTED_MAX)) {
            return new WP_Error('nvm_rate_limited', 'Too many requests.', array('status' => 429));
        }

        return true;
    }

    /** Protected deployment status. Never returns the bridge key. */
    public static function rest_health(WP_REST_Request $request)
    {
        return rest_ensure_response(array(
            'ok'                  => true,
            'core_version'        => self::VERSION,
            /* The companion site plugin differs per project, so the core
             * cannot name its class. Each site reports its own version
             * through the filter; unfiltered, the field stays null and the
             * response shape is unchanged. */
            'site_plugin_version' => apply_filters('nvm_bridge_site_plugin_version', null),
            'woocommerce_version' => defined('WC_VERSION') ? WC_VERSION : null,
            'frontend_url'        => self::frontend_url(),
            'production_ready'    => self::production_origin_ready(),
            'traffic_owner'       => self::nextjs_owns_traffic() ? 'nextjs' : 'wordpress',
            'allowed_origins'     => self::frontend_urls(),
            'checkout_skin'       => 'yes' === get_option('nvm_bridge_checkout_skin', 'no'),
            'require_account'     => self::checkout_account_required(),
            'require_storefront_login' => self::storefront_login_required(),
            'receipt_actions'     => self::receipt_actions_enabled(),
            'cart_return_version' => 2,
        ));
    }

    /**
     * Frontend server exchanges the shopper's cart identity for a short lived,
     * single use code.
     *
     * That identity is a Store API Cart-Token on most stores. On a store whose
     * session handler keys carts on its own signed cookie the storefront sends
     * `identity` instead: the cookie values it holds for this shopper, which
     * redemption sets back on the browser. Either may be supplied; at least
     * one must be. A token, when present, is validated exactly as before.
     */
    public static function rest_handoff_code(WP_REST_Request $request)
    {
        $token   = (string) $request->get_param('cart_token');
        $browser = self::identity_from_request($request);

        if (is_wp_error($browser)) {
            return $browser;
        }

        if ('' === $token && null === $browser) {
            return new WP_Error('nvm_missing_identity', 'Send cart_token or identity.', array('status' => 400));
        }

        $customer_id = '';

        if ('' !== $token) {
            $utils = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';

            if (!class_exists($utils)) {
                return new WP_Error('nvm_unavailable', 'Store API unavailable.', array('status' => 503));
            }

            if (!$utils::validate_cart_token($token)) {
                return new WP_Error('nvm_invalid_token', 'Invalid cart token.', array('status' => 400));
            }

            $payload = $utils::get_cart_token_payload($token);

            if (empty($payload['user_id']) || (int) ($payload['exp'] ?? 0) < time()) {
                return new WP_Error('nvm_expired_token', 'Cart token expired.', array('status' => 400));
            }

            $customer_id = (string) $payload['user_id'];
        }

        $identity = array();
        $auth     = (string) $request->get_param('auth');

        if ('' !== $auth) {
            $user_id = self::user_from_auth($auth);
            $parts   = wp_parse_auth_cookie($auth, 'logged_in');

            if (!$user_id || empty($parts['token'])) {
                return new WP_Error('nvm_unauthenticated', 'Session expired.', array('status' => 401));
            }

            // A cart already owned by another account must never be reassigned.
            if (ctype_digit($customer_id) && (int) $customer_id !== $user_id) {
                return new WP_Error('nvm_cart_owner_mismatch', 'Cart belongs to another customer.', array('status' => 409));
            }

            $identity = array('uid' => $user_id, 'token' => (string) $parts['token']);
        }

        if (null !== $browser) {
            $identity['identity'] = $browser;
        }

        /* Optional: finish this handoff on the pay page of an existing order.
         *
         * Bound into the single-use code here rather than read from the
         * redemption URL, so the order being paid is chosen by the storefront
         * server and cannot be swapped by whoever opens the link. Only an
         * authenticated handoff may carry one: WooCommerce lets anybody with
         * the key pay a guest order, and an account order is exactly the case
         * that needs the session this handoff is about to establish.
         */
        $pay_order_id = absint($request->get_param('pay_order_id'));

        if ($pay_order_id) {
            if (empty($identity['uid'])) {
                return new WP_Error('nvm_unauthenticated', 'Paying an existing order requires a signed in session.', array('status' => 401));
            }

            $paying = function_exists('wc_get_order') ? wc_get_order($pay_order_id) : null;

            // Answers the same for another customer's order as for one that does
            // not exist, so this cannot be used to discover orders.
            if (!$paying instanceof WC_Order || (int) $paying->get_customer_id() !== (int) $identity['uid']) {
                return new WP_Error('nvm_not_found', 'No such order.', array('status' => 404));
            }

            $identity['pay_order_id'] = $pay_order_id;
        }

        /*
         * Bind the authoritative storefront origin into the code itself.
         *
         * This is what frees redemption from the browser Referer: handle_handoff()
         * reads the origin back out of the code instead of recomputing it from a
         * header the browser may not send on the cross-origin hop. frontend_url()
         * The storefront names itself, because a site with one storefront per
         * language has more than one right answer and only the caller knows
         * which host the shopper is on. It is honoured only when the allowlist
         * already contains it; anything else falls back to the origin mapped to
         * the language, then to the configured default. So a code can still only
         * ever carry an origin this bridge already trusts, and a storefront that
         * says nothing behaves exactly as it did before.
         *
         * The language rides along for the same reason: checkout has to be built
         * in it, and the browser cannot be asked once it has arrived.
         */
        $asked  = self::origin_from_url((string) $request->get_param('frontend'));
        $locale = self::known_locale($request->get_param('locale'));

        $identity['locale']   = $locale;
        $identity['frontend'] = in_array($asked, self::frontend_urls(), true)
            ? $asked
            : self::origin_for_locale($locale);
        // Old storefronts omit this field. Keep their auth return working during
        // the Vercel rollback window; new storefronts explicitly select v2.
        if (2 === (int) $request->get_param('auth_return_version')) {
            $identity['auth_return_version'] = 2;
        }

        // Version 2 proves that the browser redeeming the URL is the browser
        // that initiated checkout. The raw state remains in an HttpOnly cookie
        // on the storefront; WordPress receives and stores only its hash.
        $checkout_state_hash = (string) $request->get_param('checkout_state_hash');
        if (2 === (int) $request->get_param('checkout_handoff_version')
            && preg_match('/\A[a-f0-9]{64}\z/D', $checkout_state_hash)) {
            $identity['checkout_handoff_version'] = 2;
            $identity['checkout_state_hash'] = $checkout_state_hash;
        }

        if (2 === (int) $request->get_param('cart_return_version')) {
            $binding = (string) $request->get_param('cart_return_binding');
            if (!preg_match('/\A[a-f0-9]{64}\z/D', $binding)) {
                return new WP_Error('nvm_bad_cart_binding', 'Cart return binding is invalid.', array('status' => 400));
            }
            $identity['cart_return_version'] = 2;
            $identity['cart_return_binding'] = $binding;
        }

        $code = self::mint_code($customer_id, 'checkout', $identity);
        if ('' === $code) return new WP_Error('nvm_unavailable', 'Checkout handoff could not be saved.', array('status' => 503));

        return rest_ensure_response(array(
            'code'         => $code,
            'expires_in'   => self::CODE_TTL,
            'cart_return_version' => (int) ($identity['cart_return_version'] ?? 1),
            'checkout_url' => home_url('/?nvm-cart-handoff=1&code=' . rawurlencode($code)),
        ));
    }

    /** Complete the browser-bound checkout handshake from the frontend server. */
    public static function rest_confirm_handoff(WP_REST_Request $request)
    {
        $intent = (string) $request->get_param('intent');
        $state  = (string) $request->get_param('state');

        if (!preg_match('/\A[a-f0-9]{64}\z/D', $state)) {
            return new WP_Error('nvm_bad_state', 'Checkout state is invalid.', array('status' => 400));
        }

        $handoff = self::consume_code_data($intent, 'checkout-confirm');
        $expected = is_array($handoff) ? (string) ($handoff['checkout_state_hash'] ?? '') : '';

        if (!$handoff || !preg_match('/\A[a-f0-9]{64}\z/D', $expected)
            || !hash_equals($expected, hash('sha256', $state))) {
            return new WP_Error('nvm_bad_intent', 'Checkout intent is invalid or already used.', array('status' => 400));
        }

        unset($handoff['p'], $handoff['checkout_state_hash'], $handoff['checkout_handoff_version']);
        $code = self::mint_code((string) $handoff['cid'], 'checkout-final', $handoff);
        if ('' === $code) return new WP_Error('nvm_unavailable', 'Checkout handoff could not be saved.', array('status' => 503));

        return rest_ensure_response(array(
            'code'         => $code,
            'expires_in'   => self::CODE_TTL,
            'checkout_url' => home_url('/?nvm-cart-handoff=1&phase=final&code=' . rawurlencode($code)),
        ));
    }

    /** Frontend server redeems a return code for a Cart-Token of the live session. */
    public static function rest_redeem_code(WP_REST_Request $request)
    {
        $utils = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';

        if (!class_exists($utils)) {
            return new WP_Error('nvm_unavailable', 'Store API unavailable.', array('status' => 503));
        }

        $data = self::consume_code_data((string) $request->get_param('code'), 'adopt');

        if (null === $data) {
            return new WP_Error('nvm_bad_code', 'Code invalid or already used.', array('status' => 400));
        }

        $customer_id = (string) ($data['cid'] ?? '');
        $identity    = isset($data['identity']) && is_array($data['identity']) ? $data['identity'] : null;

        return rest_ensure_response(array(
            'cart_token' => '' !== $customer_id ? $utils::get_cart_token($customer_id) : null,
            // The returning browser's cookie identity, as name=value pairs the
            // storefront can put straight back in its jar. Null on stores that
            // key carts on the token alone.
            'identity' => $identity ? array(
                'cid' => (string) ($identity['cid'] ?? ''),
                'wcs' => isset($identity['wcs']) && '' !== (string) $identity['wcs'] ? (string) $identity['wcs'] : null,
            ) : null,
            'order_completed' => !empty($data['order_completed']),
            'cart_return_version' => (int) ($data['cart_return_version'] ?? 1),
            'cart_return_binding' => (string) ($data['cart_return_binding'] ?? ''),
        ));
    }

    /* ------------------------------------------- storefront-started sign-ups */

    /* For the site's tracking plugins (the agency contract, f1): whether the
     * account being created right now was started on the storefront, and how.
     * Set before the user exists, for this request only. Email and Facebook
     * sign-ups run inside the bridge's own routes. A Google sign-up is created
     * by Wapu Auth on WordPress's callback, so the storefront's Google start
     * (a `wapu_auth_login` whose return is the bridge's auth return) leaves a
     * ten-minute cookie that callback reads. */
    const SIGNUP_COOKIE = 'nvm_sf_signup';

    private static ?string $signup_method = null;

    public static function mark_storefront_signup(string $method): void
    {
        self::$signup_method = in_array($method, array('email', 'google', 'facebook'), true) ? $method : null;
        if (!defined('NVM_STOREFRONT_SIGNUP')) {
            define('NVM_STOREFRONT_SIGNUP', true);
        }
    }

    public static function storefront_initiated_signup(): bool
    {
        return null !== self::storefront_signup_method();
    }

    /** `email`, `google` or `facebook`; null when this request is not a storefront sign-up. */
    public static function storefront_signup_method(): ?string
    {
        if (null !== self::$signup_method) {
            return self::$signup_method;
        }
        return 'google' === (string) ($_COOKIE[self::SIGNUP_COOKIE] ?? '') ? 'google' : null;
    }

    public static function note_google_signup(): void
    {
        if (empty($_GET['wapu_auth_login']) || headers_sent()) {
            return;
        }
        $return = (string) wp_unslash($_GET['redirect_to'] ?? '');
        if (false === strpos($return, 'nvm-auth-return')) {
            return;
        }
        setcookie(self::SIGNUP_COOKIE, 'google', array(
            'expires'  => time() + 10 * MINUTE_IN_SECONDS,
            'path'     => '/',
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ));
    }

    /* ------------------------------------------------- browser navigation URLs */

    public static function handle_navigation_endpoints(): void
    {
        if (!empty($_GET['nvm-cart-handoff'])) {
            self::handle_handoff();
            return;
        }

        if (!empty($_GET['nvm-cart-return'])) {
            self::handle_return();
            return;
        }

        if (!empty($_GET['nvm-auth-return'])) {
            self::handle_auth_return();
        }
    }

    /** Frontend -> WooCommerce. Adopts the cart that already exists. */
    private static function handle_handoff(): void
    {
        self::send_nocache();

        if (!function_exists('wc_get_checkout_url')) {
            wp_safe_redirect(home_url('/'));
            exit;
        }

        $is_final = 'final' === (string) ($_GET['phase'] ?? '');
        $target = self::redirect_target($_GET['redirect_to'] ?? '');

        // Must be a real top level navigation. Blocks <img>/<script> session
        // fixation attempts, which arrive with a non document fetch destination.
        // This gate is independent of the Referer on purpose — see the origin
        // resolution below, which no longer requires one.
        $dest = (string) ($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');

        if ('' !== $dest && 'document' !== $dest) {
            wp_safe_redirect(add_query_arg('nvm-handoff', 'blocked', $target));
            exit;
        }

        $handoff = self::consume_code_data(
            (string) ($_GET['code'] ?? ''),
            $is_final ? 'checkout-final' : 'checkout'
        );

        if (null === $handoff) {
            wp_safe_redirect(add_query_arg('nvm-handoff', 'expired', $target));
            exit;
        }

        /*
         * The storefront origin this handoff returns to.
         *
         * Preferred source is the code itself: rest_handoff_code() binds the
         * authoritative frontend origin when the code is minted, so redemption
         * no longer depends on the browser sending a Referer on the cross-origin
         * hop — the failure that stranded any customer whose browser strips it,
         * and answered a valid checkout with checkout_handoff_required. The
         * Referer stays a fallback, and remains the only source for codes minted
         * before this change deployed. Neither source is trusted on its face:
         * resolve_return_origin() returns a value only if it is already on the
         * allowlist, so an unexpected origin can cause a refusal, never a
         * redirect somewhere new.
         *
         * Checked after the code is consumed, not before. The code is the
         * single-use credential; reading the origin it carries means spending
         * it first, and the document gate above has already turned away the
         * sub-resource requests that must never reach here. A document
         * navigation that consumes a valid code but resolves no allowed origin
         * still exits below, before any session is applied, so a refusal leaves
         * the cart and session exactly as they were.
         */
        $frontend = self::resolve_return_origin(
            isset($handoff['frontend']) ? (string) $handoff['frontend'] : '',
            self::frontend_from_referrer(),
            self::frontend_urls()
        );

        if ('' === $frontend) {
            wp_safe_redirect(add_query_arg('nvm-handoff', 'blocked', $target));
            exit;
        }

        /*
         * Checkout in the language the shopper was already reading.
         *
         * The switch happens before the target is built, not after:
         * wc_get_checkout_url() asks WPML which page this is, so the language
         * decides the URL rather than being applied to it. Rebuilding $target
         * here is what turns /check-out/ into the Spanish checkout, and every
         * later recomputation inherits it.
         *
         * From here the URL carries the language, so nothing has to remember it:
         * a reload, a card return and a 3-D Secure bounce all arrive at a path
         * WPML can read for itself.
         */
        $locale = self::known_locale($handoff['locale'] ?? '');

        if ('' !== $locale) {
            do_action('wpml_switch_language', $locale);
            $target = self::redirect_target((string) ($_GET['redirect_to'] ?? ''));
        }

        if (!$is_final && 2 === (int) ($handoff['checkout_handoff_version'] ?? 1)) {
            $state_hash = (string) ($handoff['checkout_state_hash'] ?? '');
            if (!preg_match('/\A[a-f0-9]{64}\z/D', $state_hash)) {
                wp_safe_redirect(add_query_arg('nvm-handoff', 'blocked', $target));
                exit;
            }

            $handoff['redirect_to'] = 'cart' === (string) ($_GET['redirect_to'] ?? '') ? 'cart' : '';
            $handoff['return_to'] = self::safe_path($_GET['return_to'] ?? '');
            unset($handoff['p']);
            $intent = self::mint_code((string) $handoff['cid'], 'checkout-confirm', $handoff);
            if ('' === $intent) {
                wp_safe_redirect(add_query_arg('nvm-handoff', 'unavailable', $target));
                exit;
            }
            $confirm = add_query_arg('intent', $intent, $frontend . self::path('api_checkout_confirm'));
            wp_redirect($confirm);
            exit;
        }

        if ($is_final) {
            $target = self::redirect_target($handoff['redirect_to'] ?? '');
        }

        $customer_id = (string) $handoff['cid'];
        $browser     = isset($handoff['identity']) && is_array($handoff['identity']) ? $handoff['identity'] : array();

        if ($browser) {
            /*
             * Cookie identity. The browser gets back the exact cookies the
             * storefront held for it and nothing else happens to the
             * WooCommerce session on this request: a session handler that
             * keys on these cookies would discard a write made from a
             * non-mutating request anyway, and the cookies alone are what
             * make the next request, the checkout page, load the right cart.
             */
            if (!self::apply_identity_cookies($browser)) {
                wp_safe_redirect(add_query_arg('nvm-handoff', 'unsupported', $target));
                exit;
            }

            if (!empty($handoff['uid'])
                && !self::authenticate_browser((int) $handoff['uid'], (string) ($handoff['token'] ?? ''))) {
                wp_safe_redirect(add_query_arg('nvm-handoff', 'expired-auth', $target));
                exit;
            }
        } else {
            if (!self::apply_session($customer_id)) {
                wp_safe_redirect(add_query_arg('nvm-handoff', 'unsupported', $target));
                exit;
            }

            if (!empty($handoff['uid'])) {
                $user_id = (int) $handoff['uid'];

                if (!self::authenticate_session($user_id, (string) ($handoff['token'] ?? ''), $customer_id)) {
                    wp_safe_redirect(add_query_arg('nvm-handoff', 'expired-auth', $target));
                    exit;
                }
            }
        }

        // Remember which storefront page they came from, so Back to shop returns
        // them there instead of the home page.
        $return_to = self::safe_path($is_final
            ? ($handoff['return_to'] ?? '')
            : ($_GET['return_to'] ?? ''));

        if ('account' === ($_GET['redirect_to'] ?? '') && '' !== $return_to) {
            // Carry the storefront path through the login form so it survives
            // the guest -> user session migration, which changes the session key
            // and would orphan a transient keyed on it.
            $target = add_query_arg('nvm_after_login', $return_to, $target);
        }

        /* Finish on the pay page of an order this account owns.
         *
         * Checked again here, against the session that was actually
         * established rather than the one claimed when the code was minted, so
         * a code that outlived its order, or an order that has since been paid
         * or changed hands, falls through to the ordinary target. The URL is
         * WooCommerce's own, so the order key is never one this plugin carries.
         */
        $pay_order_id = (int) ($handoff['pay_order_id'] ?? 0);

        if ($pay_order_id && !empty($handoff['uid']) && function_exists('wc_get_order')) {
            $paying = wc_get_order($pay_order_id);

            if ($paying instanceof WC_Order
                && (int) $paying->get_customer_id() === (int) $handoff['uid']
                && $paying->needs_payment()) {
                $target = $paying->get_checkout_payment_url();
            }
        }

        // Deliberately NOT stored on the WooCommerce session. Marking that
        // session dirty here makes WooCommerce persist the empty cart it loaded
        // before we swapped sessions, which wipes the real cart. Retaining the
        // validated origin ensures local and production checkouts each return to
        // the storefront that initiated them.
        $return_code = bin2hex(random_bytes(24));

        set_transient(
            self::RETURN_PREFIX . hash('sha256', $return_code),
            array(
                'frontend' => $frontend,
                'locale' => $locale,
                'path' => $return_to,
                'auth_return_version' => (int) ($handoff['auth_return_version'] ?? 1),
                'cart_return_version' => (int) ($handoff['cart_return_version'] ?? 1),
                'cart_return_binding' => (string) ($handoff['cart_return_binding'] ?? ''),
            ),
            2 * HOUR_IN_SECONDS
        );

        setcookie(self::RETURN_COOKIE, $return_code, array(
            'expires'  => time() + 2 * HOUR_IN_SECONDS,
            'path'     => '/',
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ));

        wp_safe_redirect($target);
        exit;
    }

    /**
     * WooCommerce -> frontend. Mints a code for whatever session is live *now*,
     * which is what repairs the frontend after WooCommerce migrates a guest
     * session to a user session on login, or empties the cart after an order.
     */
    private static function handle_return(): void
    {
        self::send_nocache();

        if (!self::nextjs_owns_traffic()) {
            $bound = class_exists('NVM_Storefront_Router')
                ? NVM_Storefront_Router::follow_handoff_origin('')
                : '';

            if ('' === $bound) {
                wp_safe_redirect(home_url('/'));
                exit;
            }
        }

        $fallback = self::frontend_url();

        if (!function_exists('WC')) {
            wp_redirect($fallback);
            exit;
        }

        if (!WC()->session && method_exists(WC(), 'initialize_session')) {
            WC()->initialize_session();
        }

        $session = WC()->session;

        // The cookies this browser is carrying, for a storefront that keys its
        // cart on them rather than on a Cart-Token. Read before the session is
        // consulted so a handler that reports no session still returns them.
        $browser = self::identity_from_browser();

        // Only hand back a session that genuinely exists. get_customer_id() will
        // mint a brand new empty session when there is no cookie, and the storefront
        // would then adopt that empty cart and lose a good one.
        $customer_id = $session && $session->has_session() ? (string) $session->get_customer_id() : '';

        if ('' === $customer_id && !$browser) {
            wp_redirect($fallback);
            exit;
        }

        // Origin is a configured constant/option, never user input. The path was
        // validated as a relative path before it was stored.
        $return_context = null;
        $return_code    = (string) ($_COOKIE[self::RETURN_COOKIE] ?? '');

        if (preg_match('/\A[a-f0-9]{48}\z/D', $return_code)) {
            $return_key     = self::RETURN_PREFIX . hash('sha256', $return_code);
            $return_context = get_transient($return_key);
            delete_transient($return_key);

            setcookie(self::RETURN_COOKIE, '', array(
                'expires'  => time() - HOUR_IN_SECONDS,
                'path'     => '/',
                'secure'   => is_ssl(),
                'httponly' => true,
                'samesite' => 'Lax',
            ));
        }

        if (!is_array($return_context)) {
            // Backward compatibility for handoffs created before version 1.7.1.
            $return_context = get_transient(self::RETURN_PREFIX . md5($customer_id));
        }

        if (is_array($return_context)) {
            $stored_frontend = self::origin_from_url($return_context['frontend'] ?? '');

            if (in_array($stored_frontend, self::frontend_urls(), true)) {
                $fallback = $stored_frontend;
            }

            $return_to = self::safe_path($return_context['path'] ?? '');
        } else {
            $return_to = self::safe_path($return_context);
        }

        // Receipt actions may intentionally choose a different storefront page
        // from the path captured when checkout began. It is still constrained to
        // a relative path on the already validated storefront origin.
        $requested_to = self::safe_path(wp_unslash($_GET['nvm-to'] ?? ''));

        if ('' !== $requested_to) {
            $return_to = $requested_to;
        }

        // A verified receipt may authorize replacing a stale non-empty browser
        // token with this session's confirmed empty cart. The proof stays in the
        // single-use record; a query parameter can never assert completion.
        $code = self::mint_code($customer_id, 'adopt', array(
            'order_completed' => is_array($return_context) && !empty($return_context['completed_order']),
            'cart_return_version' => (int) ($return_context['cart_return_version'] ?? 1),
            'cart_return_binding' => (string) ($return_context['cart_return_binding'] ?? ''),
            'identity' => $browser ? $browser : null,
        ));
        if ('' === $code) {
            wp_redirect($fallback . $return_to);
            exit;
        }

        $url = $fallback . self::path('api_cart_adopt') . '?code=' . rawurlencode($code);

        if ('' !== $return_to) {
            $url .= '&to=' . rawurlencode($return_to);
        }

        wp_redirect($url);
        exit;
    }

    /** Bind the order created by this checkout before any receipt can clear it. */
    public static function bind_checkout_order_return($order_id): void
    {
        $return_code = (string) ($_COOKIE[self::RETURN_COOKIE] ?? '');
        if (!preg_match('/\A[a-f0-9]{48}\z/D', $return_code) || !function_exists('wc_get_order')) return;
        $key = self::RETURN_PREFIX . hash('sha256', $return_code);
        $context = get_transient($key);
        $order = is_object($order_id) ? $order_id : wc_get_order((int) $order_id);
        if (!is_array($context) || 2 !== (int) ($context['cart_return_version'] ?? 1)
            || !$order || (int) $order->get_user_id() !== get_current_user_id()) return;
        $context['checkout_order_id'] = (int) $order->get_id();
        unset($context['completed_order']);
        set_transient($key, $context, 2 * HOUR_IN_SECONDS);
    }

    /** Bind a valid order receipt to this browser's existing return context. */
    public static function mark_completed_order_return($order_id): void
    {
        $return_code = (string) ($_COOKIE[self::RETURN_COOKIE] ?? '');
        if (!preg_match('/\A[a-f0-9]{48}\z/D', $return_code) || !function_exists('wc_get_order')) return;
        $key = self::RETURN_PREFIX . hash('sha256', $return_code);
        $context = get_transient($key);
        $order = wc_get_order((int) $order_id);
        $receipt_key = (string) wp_unslash($_GET['key'] ?? '');
        if (!is_array($context) || !$order || (int) $order->get_user_id() !== get_current_user_id()
            || '' === $receipt_key || !hash_equals((string) $order->get_order_key(), $receipt_key)
            || !$order->has_status(array('pending', 'processing', 'on-hold', 'completed'))) return;
        if (2 === (int) ($context['cart_return_version'] ?? 1)
            && (int) ($context['checkout_order_id'] ?? 0) !== (int) $order_id) return;
        $context['completed_order'] = (int) $order_id;
        set_transient($key, $context, 2 * HOUR_IN_SECONDS);
    }

    /* ---------------------------------------------------------- cookie identity */

    /**
     * Read and check the `identity` object of a handoff request.
     *
     * `cid` is the value of the signed identity cookie, accepted with or
     * without its `tpc_cid=` prefix and in either its raw or its Set-Cookie
     * percent-encoded form. `wcs` is the optional WooCommerce session cookie
     * as a `name=value` pair; the name has to be WooCommerce's own so a caller
     * cannot use this to plant an arbitrary cookie. Values are opaque here.
     * They were signed by the site's session handler, which verifies them
     * itself when the browser presents them; this only refuses anything that
     * could not be a cookie value at all.
     *
     * @return array{cid:string, wcs_name:string, wcs_value:string}|null|WP_Error
     *         The decoded identity, null when none was sent, or the refusal.
     */
    private static function identity_from_request(WP_REST_Request $request)
    {
        $raw = $request->get_param('identity');

        if (null === $raw || '' === $raw || array() === $raw) {
            return null;
        }

        if (!is_array($raw)) {
            return new WP_Error('nvm_bad_identity', 'identity must be an object.', array('status' => 400));
        }

        $cid = trim((string) ($raw['cid'] ?? ''));

        if (0 === strpos($cid, self::IDENTITY_CID_COOKIE . '=')) {
            $cid = substr($cid, strlen(self::IDENTITY_CID_COOKIE) + 1);
        }

        $cid = self::cookie_value($cid);

        if ('' === $cid) {
            return new WP_Error('nvm_bad_identity', 'identity.cid is not a cookie value.', array('status' => 400));
        }

        $wcs_name  = '';
        $wcs_value = '';
        $wcs       = $raw['wcs'] ?? null;

        if (is_string($wcs) && '' !== trim($wcs)) {
            $pair = explode('=', trim($wcs), 2);

            if (2 !== count($pair) || !self::is_session_cookie_name($pair[0])) {
                return new WP_Error('nvm_bad_identity', 'identity.wcs must be the wp_woocommerce_session_* pair.', array('status' => 400));
            }

            $wcs_name  = $pair[0];
            $wcs_value = self::cookie_value($pair[1]);

            if ('' === $wcs_value) {
                return new WP_Error('nvm_bad_identity', 'identity.wcs is not a cookie value.', array('status' => 400));
            }
        }

        return array('cid' => $cid, 'wcs_name' => $wcs_name, 'wcs_value' => $wcs_value);
    }

    /**
     * Decode a cookie value the way the browser and PHP would, and refuse
     * anything a Set-Cookie header could not carry. rawurldecode rather than
     * urldecode so a literal plus survives; setcookie() re-encodes it.
     */
    private static function cookie_value(string $raw): string
    {
        $value = rawurldecode(trim($raw));

        if ('' === $value || strlen($value) > self::IDENTITY_MAX_LENGTH || preg_match('/[\x00-\x20\x7f;,"\\\\]/', $value)) {
            return '';
        }

        return $value;
    }

    private static function is_session_cookie_name(string $name): bool
    {
        return (bool) preg_match('/\A' . preg_quote(self::IDENTITY_SESSION_PREFIX, '/') . '[a-f0-9]{32}\z/', $name);
    }

    /**
     * Set the shopper's identity cookies on the browser.
     *
     * Attributes match what the site's own handler sends: path /, host-only,
     * Secure on HTTPS, HttpOnly, SameSite=Lax; thirty days for the identity
     * cookie and WooCommerce's own session length for the session cookie.
     * setcookie() percent-encodes the value exactly as the original
     * Set-Cookie did, so the browser ends up holding the same bytes.
     *
     * @param array{cid:string, wcs_name?:string, wcs_value?:string} $identity
     */
    private static function apply_identity_cookies(array $identity): bool
    {
        $cid = (string) ($identity['cid'] ?? '');

        if ('' === $cid || headers_sent()) {
            return false;
        }

        $secure = is_ssl();

        setcookie(self::IDENTITY_CID_COOKIE, $cid, array(
            'expires'  => time() + self::IDENTITY_CID_TTL,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ));

        $name  = (string) ($identity['wcs_name'] ?? '');
        $value = (string) ($identity['wcs_value'] ?? '');

        if ('' !== $name && '' !== $value && self::is_session_cookie_name($name)) {
            setcookie($name, $value, array(
                'expires'  => time() + (int) apply_filters('wc_session_expiration', 60 * 60 * 48),
                'path'     => '/',
                'secure'   => $secure,
                'httponly' => true,
                'samesite' => 'Lax',
            ));
        }

        return true;
    }

    /**
     * Log the browser into the WordPress account the handoff was minted for,
     * and nothing more. The session migration authenticate_session() performs
     * belongs to the Cart-Token path; a cookie-keyed handler moves the cart
     * itself when it sees the auth cookie on the next request.
     */
    private static function authenticate_browser(int $user_id, string $token): bool
    {
        if ($user_id < 1 || '' === $token || !get_userdata($user_id)) {
            return false;
        }

        if (!WP_Session_Tokens::get_instance($user_id)->verify($token)) {
            return false;
        }

        wp_clear_auth_cookie();
        wp_set_current_user($user_id);
        wp_set_auth_cookie($user_id, true, is_ssl(), $token);

        return true;
    }

    /**
     * The identity cookies a returning browser is carrying, as the exact
     * `name=value` pairs a Set-Cookie header would show, so the storefront
     * can put them straight into its cookie jar. Empty when there is no
     * identity cookie; the session pair is null when the browser has none.
     *
     * @return array{cid:string, wcs:?string}|array{}
     */
    private static function identity_from_browser(): array
    {
        $cid = isset($_COOKIE[self::IDENTITY_CID_COOKIE]) ? (string) $_COOKIE[self::IDENTITY_CID_COOKIE] : '';

        if ('' === $cid || strlen($cid) > self::IDENTITY_MAX_LENGTH) {
            return array();
        }

        $wcs = null;

        foreach ($_COOKIE as $name => $value) {
            if (is_string($name) && is_string($value) && '' !== $value
                && strlen($value) <= self::IDENTITY_MAX_LENGTH && self::is_session_cookie_name($name)) {
                $wcs = $name . '=' . rawurlencode($value);
                break;
            }
        }

        return array(
            'cid' => self::IDENTITY_CID_COOKIE . '=' . rawurlencode($cid),
            'wcs' => $wcs,
        );
    }

    /**
     * Point the live WooCommerce session at an existing session key and let
     * WooCommerce write and sign its own cookie. Reflection is used because
     * WC_Session_Handler exposes no setter; delegating the cookie back to
     * WooCommerce keeps this working across cookie format changes.
     */
    private static function apply_session(string $customer_id): bool
    {
        if (!function_exists('WC')) {
            return false;
        }

        if (!WC()->session && method_exists(WC(), 'initialize_session')) {
            WC()->initialize_session();
        }

        $session = WC()->session;

        if (!$session || !method_exists($session, 'set_customer_session_cookie')) {
            return false;
        }

        $reflection = new ReflectionObject($session);

        if (!$reflection->hasProperty('_customer_id')) {
            return false;
        }

        $property = $reflection->getProperty('_customer_id');
        $property->setAccessible(true);
        $property->setValue($session, $customer_id);

        // Adopt that session's data so shutdown cannot overwrite or prune it.
        if ($reflection->hasProperty('_data')) {
            $data = $reflection->getProperty('_data');
            $data->setAccessible(true);
            $data->setValue($session, (array) $session->get_session_data());
        }

        if ($reflection->hasProperty('_dirty')) {
            $dirty = $reflection->getProperty('_dirty');
            $dirty->setAccessible(true);
            $dirty->setValue($session, false);
        }

        $session->set_session_expiration();
        $session->set_customer_session_cookie(true);

        return true;
    }

    /** Log the browser into the same WordPress session and move the guest cart to it. */
    private static function authenticate_session(int $user_id, string $token, string $customer_id): bool
    {
        if ($user_id < 1 || '' === $token || !get_userdata($user_id)) {
            return false;
        }

        if (!WP_Session_Tokens::get_instance($user_id)->verify($token)) {
            return false;
        }

        $session = function_exists('WC') ? WC()->session : null;

        if (!$session
            || !method_exists($session, 'get_session')
            || !method_exists($session, 'save_data')
            || !method_exists($session, 'update_session_timestamp')) {
            return false;
        }

        // Replace any account already open on the checkout host. Clearing the
        // browser cookies does not destroy that account's server-side session.
        wp_clear_auth_cookie();
        wp_set_current_user($user_id);
        wp_set_auth_cookie($user_id, true, is_ssl(), $token);

        if ((string) $user_id !== $customer_id) {
            $reflection = new ReflectionObject($session);

            foreach (array('_customer_id', '_data', '_dirty') as $required) {
                if (!$reflection->hasProperty($required)) {
                    return false;
                }
            }

            $data = (array) $session->get_session($customer_id, array());

            $customer = $reflection->getProperty('_customer_id');
            $customer->setAccessible(true);
            $customer->setValue($session, (string) $user_id);

            $stored = $reflection->getProperty('_data');
            $stored->setAccessible(true);
            $stored->setValue($session, $data);

            $dirty = $reflection->getProperty('_dirty');
            $dirty->setAccessible(true);
            $dirty->setValue($session, true);

            $session->save_data($customer_id);
            do_action('woocommerce_guest_session_to_user_id', $customer_id, (string) $user_id);
        }

        $session->set_session_expiration();
        $reflection = new ReflectionObject($session);

        if (!$reflection->hasProperty('_session_expiration')) {
            return false;
        }

        $expiration = $reflection->getProperty('_session_expiration');
        $expiration->setAccessible(true);
        $session->update_session_timestamp((string) $user_id, (int) $expiration->getValue($session));
        $session->set_customer_session_cookie(true);

        return true;
    }

    /* ---------------------------------------------------------------- accounts */

    /** Where a handoff should land the browser. */
    private static function redirect_target(string $which): string
    {
        if ('cart' === $which) {
            return wc_get_cart_url();
        }

        if ('account' === $which) {
            return wc_get_page_permalink('myaccount');
        }

        return wc_get_checkout_url();
    }

    /**
     * After WooCommerce logs a customer in or registers them, bounce back to the
     * storefront through our own endpoint. WooCommerce uses wp_safe_redirect here,
     * so it can only target this host; the return endpoint does the cross origin hop.
     */
    public static function after_login_redirect($redirect)
    {
        $to = self::safe_path(wp_unslash($_REQUEST['nvm_after_login'] ?? ''));

        if ('' === $to) {
            return $redirect;
        }

        $args = array('nvm-auth-return' => 1, 'to' => $to);
        $lang = self::known_locale((string) apply_filters('wpml_current_language', null));
        if ('' !== $lang) {
            $args['lang'] = $lang;
        }
        $return_code = (string) ($_COOKIE[self::RETURN_COOKIE] ?? '');
        if (preg_match('/\A[a-f0-9]{48}\z/D', $return_code)) {
            $context = get_transient(self::RETURN_PREFIX . hash('sha256', $return_code));
            if (is_array($context) && 2 === (int) ($context['auth_return_version'] ?? 1)) {
                $args['auth_version'] = 2;
            }
        }

        return add_query_arg($args, home_url('/'));
    }

    /** Short-lived auth records bypass caches; the conditional delete elects one consumer. */
    private static function mint_auth_record(string $purpose, array $data): string
    {
        global $wpdb;
        $prefix = self::AUTH_RECORD_PREFIX;
        // Bound cleanup work on this infrequent path. Expiry is checked again on consume.
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST(SUBSTRING_INDEX(option_value, '|', 1) AS UNSIGNED) <= %d LIMIT 100",
            $wpdb->esc_like($prefix) . '%', time()
        ));
        $code = bin2hex(random_bytes(24));
        $value = (time() + self::CODE_TTL) . '|' . wp_json_encode(array('purpose' => $purpose, 'data' => $data));
        $saved = $wpdb->insert($wpdb->options, array(
            'option_name' => $prefix . hash('sha256', $code),
            'option_value' => $value,
            'autoload' => 'no',
        ), array('%s', '%s', '%s'));
        return $saved ? $code : '';
    }

    private static function consume_auth_record(string $code, string $purpose): ?array
    {
        global $wpdb;
        if (!preg_match('/\A[a-f0-9]{48}\z/D', $code)) return null;
        $key = self::AUTH_RECORD_PREFIX . hash('sha256', $code);
        $value = $wpdb->get_var($wpdb->prepare(
            "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $key
        ));
        if (!is_string($value)) return null;
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name = %s AND BINARY option_value = %s", $key, $value
        ));
        if (1 !== $deleted) return null;
        $parts = explode('|', $value, 2);
        if (count($parts) !== 2 || (int) $parts[0] <= time()) return null;
        $record = json_decode($parts[1], true);
        if (!is_array($record) || ($record['purpose'] ?? '') !== $purpose || !is_array($record['data'] ?? null)) return null;
        return $record['data'];
    }

    /** Verify both legs used the same authenticated WordPress browser. */
    private static function auth_intent_matches(array $intent, int $user_id, string $token, string $frontend): bool
    {
        return $user_id > 0 && '' !== $token
            && (int) ($intent['uid'] ?? 0) === $user_id
            && hash_equals((string) ($intent['session_hash'] ?? ''), hash('sha256', $token))
            && ($intent['frontend'] ?? '') === $frontend
            && in_array($frontend, self::frontend_urls(), true);
    }

    /** Logged in on WordPress: bind the return to this browser on both hosts. */
    private static function handle_auth_return(): void
    {
        /* The language decides which storefront this browser goes home to. A
           Spanish customer who signs in must not land on the English site
           holding an English basket. An explicit `lang` wins (the agency's
           sign-in links send `lang=es` for a Spanish destination); otherwise
           it is the language of the page WordPress is answering on. Only a
           language this site runs counts, so a stray value changes nothing. */
        $asked    = self::known_locale(sanitize_key((string) wp_unslash($_GET['lang'] ?? '')));
        $fallback = self::origin_for_locale('' !== $asked ? $asked : (string) apply_filters('wpml_current_language', null));

        // No storefront configured means nowhere to send anyone. Let the
        // request fall through to whatever WordPress would have rendered.
        if ('' === $fallback) {
            return;
        }

        self::send_nocache();
        header('Referrer-Policy: no-referrer');
        // The Google sign-up, if there was one, is over.
        if (isset($_COOKIE[self::SIGNUP_COOKIE]) && !headers_sent()) {
            setcookie(self::SIGNUP_COOKIE, '', array('expires' => 1, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
        }

        $user_id  = get_current_user_id();
        $auth = (string) ($_COOKIE[LOGGED_IN_COOKIE] ?? '');
        $parts = wp_parse_auth_cookie($auth, 'logged_in');
        $token = (string) ($parts['token'] ?? '');

        if (!$user_id || '' === $token || (int) ($parts['expiration'] ?? 0) <= time()
            || self::user_from_auth($auth) !== $user_id || !in_array($fallback, self::frontend_urls(), true)) {
            wp_redirect($fallback);
            exit;
        }

        $cart_customer = '';
        if (function_exists('WC')) {
            if (!WC()->session && method_exists(WC(), 'initialize_session')) WC()->initialize_session();
            if (WC()->session) $cart_customer = (string) WC()->session->get_customer_id();
        }

        // Protocol 1 exists only for a bounded rollback window. It is selected
        // from the server-bound checkout context, never from a failed v2 attempt.
        if (2 !== (int) ($_GET['auth_version'] ?? 1)) {
            $code = self::mint_auth_record('auth-legacy', array(
                'uid' => $user_id,
                'cid' => $cart_customer,
                'to' => self::safe_path(wp_unslash($_GET['to'] ?? '')),
            ));
            wp_redirect($code ? $fallback . self::path('api_auth_callback') . '?code=' . rawurlencode($code)
                : $fallback . self::path('account') . '?error=auth_return_unavailable');
            exit;
        }

        $intent_code = (string) wp_unslash($_GET['intent'] ?? '');
        if ('' === $intent_code) {
            $intent = self::mint_auth_record('intent', array(
                'uid' => $user_id,
                'session_hash' => hash('sha256', $token),
                'frontend' => $fallback,
                'to' => self::safe_path(wp_unslash($_GET['to'] ?? '')),
            ));
            wp_redirect($intent ? $fallback . self::path('api_auth_begin') . '?intent=' . rawurlencode($intent) : $fallback . self::path('account') . '?error=auth_return_unavailable');
            exit;
        }

        $state = (string) wp_unslash($_GET['state'] ?? '');
        $frontend = (string) wp_unslash($_GET['frontend'] ?? '');
        $intent = self::consume_auth_record($intent_code, 'intent');
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $state) || !$intent
            || !self::auth_intent_matches($intent, $user_id, $token, $frontend)) {
            wp_redirect($fallback . self::path('account') . '?error=auth_return_invalid');
            exit;
        }

        $code = self::mint_auth_record('auth', array(
                'uid' => $user_id,
                'cid' => $cart_customer,
                'to' => (string) ($intent['to'] ?? ''),
                'frontend' => $frontend,
                'state_hash' => hash('sha256', $state),
                // Kept only server-side for 120s; never included in a browser URL.
                'auth' => $auth,
        ));
        wp_redirect($code ? $frontend . self::path('api_auth_callback') . '?code=' . rawurlencode($code) . '&state=' . rawurlencode($state)
            : $frontend . self::path('account') . '?error=auth_return_unavailable');
        exit;
    }

    /** Resolve a WordPress logged-in cookie value to a user, or 0. */
    private static function user_from_auth(string $auth): int
    {
        if ('' === $auth) {
            return 0;
        }

        // WordPress's own validator. It verifies the signature, the expiry and
        // that the session token still exists, so a WordPress side logout
        // invalidates this immediately.
        return (int) wp_validate_auth_cookie($auth, 'logged_in');
    }

    /**
     * Public profile of a customer.
     *
     * Deliberately carries no URLs. The `urls` key here used to ship my-account
     * links all the way into the browser; the storefront owns every account
     * screen now, and keeping them would only invite that bounce back to
     * WordPress to reappear the next time a panel needed a link.
     */
    private static function user_payload(int $user_id): array
    {
        $user = get_userdata($user_id);

        if (!$user) {
            return array();
        }

        return array(
            'id'           => $user_id,
            'email'        => $user->user_email,
            'display_name' => $user->display_name,
            'first_name'   => get_user_meta($user_id, 'first_name', true),
            'last_name'    => get_user_meta($user_id, 'last_name', true),
            'marketing_opt_in' => self::marketing_opt_in($user_id),
        );
    }

    /**
     * The customer's stored answer to the checkout's marketing box: true, false,
     * or null when they never answered. The storefront ticks the box only for
     * true (the agency's Oct 12 review). The meta key is the site's own
     * (Peptides Collective: tpc-store's `tpc_research_updates`, '1' or '0').
     */
    private static function marketing_opt_in(int $user_id): ?bool
    {
        $key = (string) apply_filters('nvm_bridge_consent_user_meta', 'tpc_research_updates');
        if ('' === $key) {
            return null;
        }
        $stored = get_user_meta($user_id, $key, true);
        if ('' === $stored || null === $stored || false === $stored) {
            return null;
        }
        return '1' === (string) $stored;
    }

    /* --------------------------------------------------------- account routes */

    /** Exchange a single use auth code for a session the storefront can hold. */
    public static function rest_redeem_auth(WP_REST_Request $request)
    {
        $state = (string) $request->get_param('state');
        $frontend = (string) $request->get_param('frontend');
        if ('' === $state && '' === $frontend) {
            $data = self::consume_auth_record((string) $request->get_param('code'), 'auth-legacy');
            if (!$data || empty($data['uid'])) {
                return new WP_Error('nvm_bad_code', 'Code invalid or already used.', array('status' => 400));
            }
            $user_id = (int) $data['uid'];
            $expiration = time() + (int) apply_filters('auth_cookie_expiration', 14 * DAY_IN_SECONDS, $user_id, false);
            $token = WP_Session_Tokens::get_instance($user_id)->create($expiration);
            $auth = wp_generate_auth_cookie($user_id, $expiration, 'logged_in', $token);
            $utils = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';
            $cart_owner = !empty($data['cid']) ? (string) $data['cid'] : (string) $user_id;
            self::session_issued($user_id, 'redeem-auth');
            return rest_ensure_response(array(
                'auth' => $auth,
                'expires' => $expiration,
                'cart_token' => class_exists($utils) ? $utils::get_cart_token($cart_owner) : null,
                'user' => self::user_payload($user_id),
                'to' => (string) ($data['to'] ?? ''),
                'new_account' => self::recently_registered($user_id),
            ));
        }

        $data = self::consume_auth_record((string) $request->get_param('code'), 'auth');
        if (!$data || !preg_match('/\A[a-f0-9]{64}\z/D', $state)
            || !hash_equals((string) ($data['state_hash'] ?? ''), hash('sha256', $state))
            || ($data['frontend'] ?? '') !== $frontend
            || !in_array($frontend, self::frontend_urls(), true)) {
            return new WP_Error('nvm_bad_code', 'Code invalid or already used.', array('status' => 400));
        }

        $auth = (string) ($data['auth'] ?? '');
        $user_id = self::user_from_auth($auth);
        $parts = wp_parse_auth_cookie($auth, 'logged_in');
        $expiration = (int) ($parts['expiration'] ?? 0);
        if (!$user_id || $user_id !== (int) ($data['uid'] ?? 0) || $expiration <= time()) {
            return new WP_Error('nvm_unauthenticated', 'Session expired.', array('status' => 401));
        }

        $utils      = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';
        $cart_owner = !empty($data['cid']) ? (string) $data['cid'] : (string) $user_id;
        self::session_issued($user_id, 'redeem-auth');

        return rest_ensure_response(array(
            'auth'       => $auth,
            'expires'    => $expiration,
            'cart_token' => class_exists($utils) ? $utils::get_cart_token($cart_owner) : null,
            'user'       => self::user_payload($user_id),
            'to'         => (string) ($data['to'] ?? ''),
            'new_account' => self::recently_registered($user_id),
        ));
    }

    /**
     * Whether a Google sign-in just created this account.
     *
     * The social login plugin creates the user on WordPress and says nothing
     * about it to the storefront, so a first Google sign-in and a returning one
     * look the same on arrival. The ad platforms count sign-ups, not sign-ins;
     * an account made in the last few minutes is the one signal both sides can
     * see. The window is wide enough for a slow Google consent screen and
     * narrow enough that a returning customer is never counted twice.
     */
    private static function recently_registered(int $user_id): bool
    {
        $user = get_userdata($user_id);
        if (!$user || '' === (string) $user->user_registered) {
            return false;
        }
        $registered = strtotime($user->user_registered . ' UTC');
        return false !== $registered && time() - $registered <= 15 * MINUTE_IN_SECONDS;
    }

    /** Who is this? Resolved from the forwarded WordPress cookie only. */
    public static function rest_me(WP_REST_Request $request)
    {
        $user_id = self::user_from_auth((string) $request->get_param('auth'));

        if (!$user_id) {
            return new WP_Error('nvm_unauthenticated', 'Not signed in.', array('status' => 401));
        }

        /* Site plugins add their own keys beside `user` (the agency contract,
           b1/d: `tpc`). `user` itself is this bridge's and is put back after
           the filter, so no extension can change who the storefront thinks is
           signed in. */
        $payload  = array('user' => self::user_payload($user_id));
        $filtered = apply_filters('nvm_bridge_me_payload', $payload, $user_id, $request);
        if (is_array($filtered)) {
            $payload = array_merge($filtered, array('user' => $payload['user']));
        }

        return rest_ensure_response($payload);
    }

    /** That customer's own orders. Never accepts a caller supplied user id. */
    public static function rest_my_orders(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        if (!function_exists('wc_get_orders')) {
            return new WP_Error('nvm_unavailable', 'Orders are temporarily unavailable.', array('status' => 503));
        }

        $limit = min(50, max(1, (int) ($request->get_param('limit') ?: 20)));
        $page  = max(1, (int) ($request->get_param('page') ?: 1));

        // paginate hands back the row count with the page, so the storefront can
        // draw its pager without a second round trip to count them.
        $query = wc_get_orders(array(
            'customer_id' => $user_id,
            'limit'       => $limit,
            'page'        => $page,
            'orderby'     => 'date',
            'order'       => 'DESC',
            'paginate'    => true,
        ));

        $payload = array();

        foreach ($query->orders as $order) {
            $payload[] = self::order_summary($order);
        }

        return rest_ensure_response(array(
            'orders' => $payload,
            'total'  => (int) $query->total,
            'pages'  => (int) $query->max_num_pages,
        ));
    }

    /** Public order status, released only when number and billing email match. */
    public static function rest_track_order(WP_REST_Request $request)
    {
        $number = ltrim(trim((string) $request->get_param('order_number')), '#');
        $email  = strtolower(trim((string) $request->get_param('email')));

        if (!preg_match('/^\d{1,20}$/', $number) || !is_email($email)) {
            return new WP_Error('nvm_bad_request', 'Enter a valid order number and billing email.', array('status' => 400));
        }

        // The storefront server is the network caller for every visitor, so a
        // subject bucket stops repeated guesses without throttling the shop.
        if (self::attempt_limited('track-order', $number . '|' . $email, 10)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        $order = function_exists('wc_get_order') ? wc_get_order((int) $number) : null;

        // One answer covers an unknown number and a mismatched address, so this
        // endpoint cannot confirm which order numbers exist.
        if (
            !$order instanceof WC_Order
            || 0 !== strcasecmp((string) $order->get_billing_email(), $email)
            || (string) $order->get_order_number() !== $number
        ) {
            return new WP_Error('nvm_not_found', 'Those details did not match an order.', array('status' => 404));
        }

        return rest_ensure_response(array('order' => self::order_summary($order)));
    }

    /** Destroy just this storefront session. WordPress remains the authority. */
    public static function rest_logout(WP_REST_Request $request)
    {
        $auth   = (string) $request->get_param('auth');
        $user_id = self::user_from_auth($auth);

        if ($user_id) {
            $parts = wp_parse_auth_cookie($auth, 'logged_in');

            if (!empty($parts['token'])) {
                WP_Session_Tokens::get_instance($user_id)->destroy($parts['token']);
            }
        }

        return rest_ensure_response(array('ok' => true));
    }

    /* ------------------------------------------------------------ cache safety */

    private static function send_nocache(): void
    {
        nocache_headers();
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
        header('Pragma: no-cache', true);
        header('X-LiteSpeed-Cache-Control: no-cache', true);
        do_action('litespeed_control_set_nocache', 'nvm headless bridge');
    }

    /** Cart, checkout and account must never be cached, enforced in code. */
    public static function enforce_nocache_on_store_pages(): void
    {
        if (!function_exists('is_cart')) {
            return;
        }

        if (is_cart() || is_checkout() || is_account_page()) {
            self::send_nocache();
        }
    }

    /**
     * Cart responses and this plugin's own routes carry a shopper's session.
     * Never cache them. Product reads are left alone on purpose: the storefront
     * caches the catalogue read, and a page cache in front of WordPress may
     * too.
     */
    public static function enforce_nocache_on_store_api($result, $server, $request)
    {
        if (!$request instanceof WP_REST_Request) {
            return $result;
        }

        $route = (string) $request->get_route();

        if (preg_match('#^/wc/store(/v\d+)?/cart(/|$)#', $route) || 0 === strpos($route, '/' . self::REST_NS . '/')) {
            if ($result instanceof WP_REST_Response) {
                $result->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
                $result->header('Pragma', 'no-cache');
                $result->header('X-LiteSpeed-Cache-Control', 'no-cache');
            }

            do_action('litespeed_control_set_nocache', 'nvm headless bridge: cart data');
        }

        return $result;
    }

    /* ------------------------------------------------------- customer auth */

    /**
     * Throttle keyed on something other than the caller's IP.
     *
     * rate_limited() keys on IP, which is right for public endpoints and useless
     * here: every bridge call arrives from the storefront's single server, so an
     * IP bucket cannot tell one account's attempts apart from the whole shop's.
     * Sign in is throttled per email address instead.
     */
    private static function attempt_limited(string $bucket, string $subject, int $max): bool
    {
        $key   = 'nvm_al_' . $bucket . '_' . md5(strtolower($subject));
        $count = (int) get_transient($key);

        if ($count >= $max) {
            return true;
        }

        set_transient($key, $count + 1, 15 * MINUTE_IN_SECONDS);

        return false;
    }

    /**
     * Mint a WordPress session for a customer the storefront just authenticated.
     *
     * Deliberately does NOT touch the cart. The storefront keeps the cart token it
     * already holds, so signing in cannot empty a basket - the failure this
     * codebase has already hit three times. The guest session row is left alone,
     * and the checkout handoff migrates it to the account at checkout exactly as
     * it does for a guest today.
     */
    private static function issue_session(int $user_id, string $cart_token = ''): array
    {
        $expiration = time() + (int) apply_filters('auth_cookie_expiration', 14 * DAY_IN_SECONDS, $user_id, false);
        $token      = WP_Session_Tokens::get_instance($user_id)->create($expiration);

        $session = array(
            'auth'    => wp_generate_auth_cookie($user_id, $expiration, 'logged_in', $token),
            'expires' => $expiration,
            'user'    => self::user_payload($user_id),
        );

        $cart_token = trim($cart_token);
        $utils      = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';

        /* Authentication does not migrate or rewrite the cart. It acknowledges
         * the exact guest identity the storefront already holds, but only after
         * WooCommerce validates its signature and expiry. Returning it lets the
         * storefront issue auth and cart cookies together on one redirect. */
        if ('' !== $cart_token && class_exists($utils) && $utils::validate_cart_token($cart_token)) {
            $session['cart_token'] = $cart_token;
        }

        return $session;
    }

    /** Sign in with an email and password. WordPress performs the actual check. */
    public static function rest_signin(WP_REST_Request $request)
    {
        $email    = trim((string) $request->get_param('email'));
        $password = (string) $request->get_param('password');

        if ('' === $email || '' === $password) {
            return new WP_Error('nvm_bad_request', 'Enter your email and password.', array('status' => 400));
        }

        if (self::attempt_limited('signin', $email, 8)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        // wp_authenticate runs the whole stack: the password check, every plugin
        // filter, and any lockout or second factor a security plugin installs.
        // Nothing here reimplements a credential check.
        $user = wp_authenticate($email, $password);

        // One message for every failure. Naming the reason would tell an attacker
        // which addresses are registered.
        if (is_wp_error($user) || !user_can($user->ID, 'read')) {
            return new WP_Error('nvm_bad_credentials', 'Those details did not match an account.', array('status' => 401));
        }

        $session = self::issue_session((int) $user->ID, (string) $request->get_param('cart_token'));
        self::session_issued((int) $user->ID, 'signin');

        return rest_ensure_response($session);
    }

    /**
     * A new customer account, as every storefront sign-up creates it.
     *
     * wc_create_new_customer rather than wp_create_user: it assigns the
     * customer role and fires the WooCommerce hooks a new account expects,
     * including the welcome email. With no password, WooCommerce generates one
     * only while its own "generate password" setting is on, so that answer is
     * forced for this call rather than left to a checkbox that would reject the
     * sign-up. The welcome email is rendered inside this call; the reset flag
     * points its set-password link at the storefront, as for a reset email.
     *
     * @return int|WP_Error
     */
    private static function create_customer(string $email, string $first, string $last, string $password = '')
    {
        $generate = static fn () => 'yes';
        if ('' === $password) {
            add_filter('pre_option_woocommerce_registration_generate_password', $generate);
        }
        self::$sending_reset_email = true;
        try {
            return wc_create_new_customer($email, '', $password, array(
                'first_name' => $first,
                'last_name'  => $last,
            ));
        } finally {
            self::$sending_reset_email = false;
            remove_filter('pre_option_woocommerce_registration_generate_password', $generate);
        }
    }

    /* For NVM_Storefront_Signup (includes/storefront-signup.php), which signs
     * in and signs up exactly as the routes in this class do. */

    /** @return int|WP_Error */
    public static function create_customer_public(string $email, string $first, string $last)
    {
        return self::create_customer($email, $first, $last);
    }

    /**
     * Tell site plugins that a storefront session was just issued (the agency
     * contract, f1). Sign-in checks the password with wp_authenticate(), which
     * never fires wp_login, so a listener that must see every sign-in (consent
     * capture, click-to-account linking) hooks here instead. $via is `signin`,
     * `register` or `redeem-auth`. It runs inside the request that carries the
     * shopper's forwarded campaign cookies and Sec-GPC. A listener that fails
     * is logged and never costs the customer their sign-in.
     */
    public static function session_issued(int $user_id, string $via): void
    {
        try {
            do_action('nvm_bridge_session_issued', $user_id, $via);
        } catch (\Throwable $error) {
            error_log('[nvm-bridge] nvm_bridge_session_issued listener failed: ' . get_class($error));
        }
    }

    public static function issue_session_public(int $user_id, string $cart_token = ''): array
    {
        return self::issue_session($user_id, $cart_token);
    }

    public static function attempt_limited_public(string $bucket, string $subject, int $max): bool
    {
        return self::attempt_limited($bucket, $subject, $max);
    }

    /** Create a customer, honouring the store's own registration setting. */
    public static function rest_register(WP_REST_Request $request)
    {
        /* Request-only flag for sign-ups the storefront started (relaunch
         * plan, task 7): Microsoft's sign_up is then the storefront's, so a
         * user_register listener such as the UET snippet can skip its own.
         * Defined for this request alone; GA4's server-side sign_up is
         * unaffected. */
        self::mark_storefront_signup('email');

        if ('yes' !== get_option('woocommerce_enable_myaccount_registration')) {
            return new WP_Error('nvm_registration_closed', 'Account registration is not open.', array('status' => 403));
        }

        $email    = sanitize_email((string) $request->get_param('email'));
        $password = (string) $request->get_param('password');
        $first    = sanitize_text_field((string) $request->get_param('first_name'));
        $last     = sanitize_text_field((string) $request->get_param('last_name'));

        if (!is_email($email)) {
            return new WP_Error('nvm_bad_email', 'That email address is not valid.', array('status' => 400));
        }

        // An empty password is the email-only sign-up on the access gate:
        // WooCommerce generates one and its welcome email carries the link to
        // set it. A password the customer did type still has to be a real one.
        if ('' !== $password && strlen($password) < 8) {
            return new WP_Error('nvm_weak_password', 'Use a password of at least 8 characters.', array('status' => 400));
        }

        // Keyed by email, not by IP, for the reason the README gives: every call
        // arrives from the storefront server, so client_ip() is one value for the
        // whole shop. Keyed that way this capped the entire store at 10 new
        // customers per 15 minutes and answered the 11th with "too many attempts".
        // rest_signin already throttles per email; this now matches it.
        if (self::attempt_limited('register', $email, 10)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        // Registration has to say whether an address is taken - the customer
        // cannot act on anything vaguer, and WooCommerce's own form says the same.
        if (email_exists($email)) {
            return new WP_Error('nvm_email_taken', 'An account already exists for that email. Try signing in instead.', array('status' => 409));
        }

        /* The research declaration (2.7.0). The storefront sends it with every
         * sign-up; answers that are present but incomplete are refused before
         * any account exists. A request without one (a storefront older than
         * 2.7.0) still registers, as before. */
        $declaration = null;
        if (null !== $request->get_param('declaration')) {
            $declaration = NVM_Storefront_Signup::declaration($request->get_param('declaration'));
            if (null === $declaration) {
                return new WP_Error('nvm_declaration_required', 'Answer the research questions to continue.', array('status' => 400));
            }
        }

        $user_id = self::create_customer($email, $first, $last, $password);

        if (is_wp_error($user_id)) {
            return new WP_Error('nvm_register_failed', $user_id->get_error_message(), array('status' => 400));
        }

        if (null !== $declaration) {
            NVM_Storefront_Signup::save_declaration((int) $user_id, $declaration, 'storefront-register');
        }

        $session = self::issue_session((int) $user_id, (string) $request->get_param('cart_token'));
        self::session_issued((int) $user_id, 'register');

        return rest_ensure_response($session);
    }

    /* ------------------------------------------------------- account helpers */

    /**
     * Resolve the caller, or the WP_Error every account route answers with.
     *
     * Kept in one place so no route can grow a second opinion about who is
     * asking. A caller supplied id is the one thing that must never work here.
     *
     * @return int|WP_Error
     */
    private static function require_user(WP_REST_Request $request)
    {
        $user_id = self::user_from_auth((string) $request->get_param('auth'));

        if (!$user_id) {
            return new WP_Error('nvm_unauthenticated', 'Not signed in.', array('status' => 401));
        }

        return $user_id;
    }

    /**
     * The list form of an order, also the base of the detail form.
     *
     * Carries no view_url. That was a my-account link; the storefront renders
     * the order itself at /account/orders/{id} and never leaves the site.
     */
    private static function order_summary(WC_Order $order): array
    {
        $items = array();

        foreach ($order->get_items() as $item) {
            $items[] = array('name' => $item->get_name(), 'quantity' => $item->get_quantity());
        }

        $created = $order->get_date_created();

        return array(
            'id'           => $order->get_id(),
            'number'       => $order->get_order_number(),
            'date'         => $created ? $created->date('c') : null,
            'status'       => $order->get_status(),
            'status_label' => wc_get_order_status_name($order->get_status()),
            'total'        => $order->get_total(),
            'currency'     => $order->get_currency(),
            'item_count'   => $order->get_item_count(),
            'items'        => $items,
        );
    }

    /** One address in the single shape the forms and the order detail share. */
    private static function address_shape(array $address, bool $with_email): array
    {
        $out = array();

        foreach (array('first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country') as $key) {
            $out[$key] = (string) ($address[$key] ?? '');
        }

        // WooCommerce has no shipping email. The key is emitted anyway so one
        // form component can render either address without branching on type.
        $out['email'] = $with_email ? (string) ($address['email'] ?? '') : '';
        $out['phone'] = (string) ($address['phone'] ?? '');

        return $out;
    }

    /**
     * The state list for a single country.
     *
     * The whole table runs to thousands of rows across every country WooCommerce
     * knows and would dwarf the rest of the payload. The account forms carry no
     * client JavaScript, so changing country simply re-renders with the right
     * list; only the country actually in use ever has to be sent.
     */
    private static function states_for(string $country): array
    {
        // A customer who has never saved an address gets the store's base
        // country, because that is the one the form preselects for them.
        if ('' === $country) {
            $country = (string) WC()->countries->get_base_country();
        }

        $states = WC()->countries->get_states($country);

        return is_array($states) ? $states : array();
    }

    /** Form values arrive as JSON, so refuse anything that is not a plain value. */
    private static function flat_value(array $input, string $key): string
    {
        $value = $input[$key] ?? '';

        return is_scalar($value) ? (string) $value : '';
    }

    /** One code for every address problem; the field list drives the highlight. */
    private static function address_error(array $fields): WP_Error
    {
        return new WP_Error(
            'nvm_invalid_address',
            'Check the highlighted fields and try again.',
            array('status' => 400, 'fields' => array_values(array_unique($fields)))
        );
    }

    /**
     * Sanitize and validate one submitted address.
     *
     * Which fields are required comes from WooCommerce's own locale table rather
     * than a list kept here, so a country with no postcodes or no states behaves
     * on the storefront exactly as it already does at checkout.
     *
     * @return array|WP_Error
     */
    private static function clean_address(array $input, string $type)
    {
        $keys = array('first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'phone');

        if ('billing' === $type) {
            $keys[] = 'email';
        }

        $countries = WC()->countries->get_allowed_countries();
        $country   = strtoupper((string) wc_clean(self::flat_value($input, 'country')));

        // Rejected before the locale lookup, which would otherwise quietly fall
        // back to a generic form for a country the store does not sell to.
        if (!isset($countries[$country])) {
            return self::address_error(array('country'));
        }

        $clean = array('country' => $country);

        foreach ($keys as $key) {
            $value = self::flat_value($input, $key);

            $clean[$key] = 'email' === $key ? sanitize_email($value) : (string) wc_clean($value);
        }

        $errors = array();
        $states = WC()->countries->get_states($country);

        if (is_array($states) && $states) {
            $clean['state'] = strtoupper($clean['state']);

            if ('' !== $clean['state'] && !isset($states[$clean['state']])) {
                $errors[] = 'state';
            }
        }

        if ('' !== $clean['postcode']) {
            // Formatted first, because that is what uppercases and spaces a
            // postcode into the form the validator expects.
            $clean['postcode'] = wc_format_postcode($clean['postcode'], $country);

            if (!WC_Validation::is_postcode($clean['postcode'], $country)) {
                $errors[] = 'postcode';
            }
        }

        if ('billing' === $type && '' !== $clean['email'] && !is_email($clean['email'])) {
            $errors[] = 'email';
        }

        // WooCommerce marks required-ness per country, so this is the same test
        // checkout applies rather than a second opinion about it.
        $form = WC()->countries->get_address_fields($country, $type . '_');

        foreach ($clean as $key => $value) {
            $field = $form[$type . '_' . $key] ?? null;

            if ($field && !empty($field['required']) && '' === $value) {
                $errors[] = $key;
            }
        }

        return $errors ? self::address_error($errors) : $clean;
    }

    /**
     * Every file this customer may download.
     *
     * The URL WooCommerce mints is a WordPress URL carrying the order key and the
     * customer's email address, so it is never handed to the browser. It goes out
     * as wc_url for the storefront to fetch server side, and the browser only ever
     * sees our own path built from the stable id.
     */
    private static function downloads_for(int $user_id): array
    {
        if (!function_exists('wc_get_customer_available_downloads')) {
            return array();
        }

        $downloads = array();

        foreach (wc_get_customer_available_downloads($user_id) as $download) {
            $remaining = $download['downloads_remaining'] ?? '';
            $expires   = $download['access_expires'] ?? null;

            $downloads[] = array(
                // Derived, never stored: the storefront resolves an id back to a
                // file by re-listing this customer's downloads, so there is no
                // download map to keep in sync and nothing to guess into.
                'id'                  => md5($download['order_id'] . '|' . $download['product_id'] . '|' . $download['download_id']),
                'order_id'            => (int) $download['order_id'],
                'product_name'        => (string) $download['product_name'],
                'download_name'       => (string) $download['download_name'],
                // WooCommerce records unlimited as an empty string.
                'downloads_remaining' => ('' === $remaining || null === $remaining) ? "\u{221E}" : (string) $remaining,
                'access_expires'      => $expires ? gmdate('c', (int) strtotime((string) $expires)) : null,
                'wc_url'              => (string) $download['download_url'],
            );
        }

        return $downloads;
    }

    /**
     * The customer's saved cards.
     *
     * Built from the tokens rather than wc_get_customer_saved_methods_list(),
     * whose entries come with ready made my-account delete and default URLs
     * attached. Those must never reach the storefront, and stripping them by hand
     * on every call is exactly the sort of step that gets forgotten once.
     */
    private static function payment_methods_for(int $user_id): array
    {
        if (!class_exists('WC_Payment_Tokens')) {
            return array();
        }

        $methods = array();

        foreach (WC_Payment_Tokens::get_customer_tokens($user_id) as $token) {
            $expires = '';

            if ($token instanceof WC_Payment_Token_CC) {
                $expires = sprintf('%02d/%s', (int) $token->get_expiry_month(), substr((string) $token->get_expiry_year(), -2));
            }

            $methods[] = array(
                'id'           => (int) $token->get_id(),
                'method_title' => (string) $token->get_display_name(),
                'is_default'   => (bool) $token->is_default(),
                'expires'      => $expires,
                'can_delete'   => true,
            );
        }

        return $methods;
    }

    /**
     * Load a payment token only if it belongs to the caller.
     *
     * WC_Payment_Tokens::get() takes a bare id, so without this an id from
     * anywhere at all would delete or promote somebody else's card.
     *
     * @return WC_Payment_Token|WP_Error
     */
    private static function own_token(int $user_id, WP_REST_Request $request)
    {
        $token = class_exists('WC_Payment_Tokens')
            ? WC_Payment_Tokens::get((int) $request->get_param('token_id'))
            : null;

        if (!$token || (int) $token->get_user_id() !== $user_id) {
            return new WP_Error('nvm_not_found', 'No such payment method.', array('status' => 404));
        }

        return $token;
    }

    /* --------------------------------------------------------- account routes */

    /** Edit the profile. Only a change of email is worth asking for a password. */
    public static function rest_my_update(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        $user = get_userdata($user_id);

        if (!$user) {
            return new WP_Error('nvm_unauthenticated', 'Not signed in.', array('status' => 401));
        }

        $first    = sanitize_text_field((string) $request->get_param('first_name'));
        $last     = sanitize_text_field((string) $request->get_param('last_name'));
        $display  = sanitize_text_field((string) $request->get_param('display_name'));
        $email_in = trim((string) $request->get_param('email'));

        $fields = array('ID' => $user_id, 'first_name' => $first, 'last_name' => $last);

        // WooCommerce refuses a display name that is an email address because it
        // is shown publicly on reviews. Left unset rather than rejected: the
        // contract has no code for it and the rest of the edit is still good.
        if ('' !== $display && !is_email($display)) {
            $fields['display_name'] = $display;
        }

        // Compared against what is stored, so re-submitting the same address the
        // form was prefilled with never demands a password.
        $changing_email = '' !== $email_in && 0 !== strcasecmp($email_in, (string) $user->user_email);
        $email          = '';

        if ($changing_email) {
            $email = sanitize_email($email_in);

            if (!is_email($email)) {
                return new WP_Error('nvm_bad_email', 'That email address is not valid.', array('status' => 400));
            }

            if (self::attempt_limited('me-update', (string) $user_id, 10)) {
                return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
            }

            // The email is half of the sign in pair, so taking it over takes over
            // the account. Nothing else on this form is worth that much.
            if (!wp_check_password((string) $request->get_param('current_password'), $user->user_pass, $user_id)) {
                return new WP_Error('nvm_bad_password', 'That password is not correct.', array('status' => 401));
            }

            if (email_exists($email)) {
                return new WP_Error('nvm_email_taken', 'That email is already used by another account.', array('status' => 409));
            }

            $fields['user_email'] = $email;
        }

        $result = wp_update_user($fields);

        if (is_wp_error($result)) {
            return new WP_Error('nvm_update_failed', $result->get_error_message(), array('status' => 400));
        }

        // Keep the WooCommerce customer record in step exactly as WooCommerce's
        // own edit-account form does, or checkout goes on prefilling the old
        // details. The WordPress account is already saved by this point, so a
        // failure here is logged rather than reported: telling the customer the
        // edit failed when it did not is worse than a stale billing name.
        try {
            $customer = new WC_Customer($user_id);

            if ($changing_email) {
                $customer->set_billing_email($email);
            }

            if ($first !== (string) $user->first_name) {
                $customer->set_billing_first_name($first);
            }

            if ($last !== (string) $user->last_name) {
                $customer->set_billing_last_name($last);
            }

            $customer->save();

            do_action('woocommerce_save_account_details', $user_id);
        } catch (Exception $e) {
            error_log('nvm-headless-bridge: customer sync failed for user ' . $user_id . ': ' . $e->getMessage());
        }

        return rest_ensure_response(array('user' => self::user_payload($user_id)));
    }

    /** One order in full, scoped to the caller by the order's own customer id. */
    public static function rest_my_order(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        if (!function_exists('wc_get_order') || !function_exists('wc_get_customer_available_downloads')) {
            return new WP_Error('nvm_unavailable', 'Order details are temporarily unavailable.', array('status' => 503));
        }

        $order = wc_get_order((int) $request->get_param('id'));

        // Somebody else's order answers exactly like an id that does not exist,
        // so this cannot be walked to discover other customers' orders. Refunds
        // fail the instanceof for the same reason: they are not orders.
        if (!$order instanceof WC_Order || (int) $order->get_customer_id() !== $user_id) {
            return new WP_Error('nvm_not_found', 'No such order.', array('status' => 404));
        }

        $items = array();

        foreach ($order->get_items() as $item_id => $item) {
            $product = $item->get_product();
            $image   = '';
            $slug    = '';

            if ($product) {
                $image_id = (int) $product->get_image_id();

                if ($image_id) {
                    $src   = wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail');
                    $image = $src ? $src : '';
                }

                // A variation's own slug does not resolve on the storefront, so
                // link the parent product the customer actually browsed.
                $parent_id = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
                $slug      = (string) get_post_field('post_name', $parent_id);
            }

            $items[] = array(
                'id'             => (int) $item_id,
                'name'           => $item->get_name(),
                'quantity'       => $item->get_quantity(),
                'sku'            => $product ? (string) $product->get_sku() : '',
                'total'          => $item->get_total(),
                'subtotal'       => $item->get_subtotal(),
                'image'          => $image,
                'permalink_slug' => $slug,
            );
        }

        $totals = array();

        // WooCommerce returns these as price markup, and it is the only source for
        // the shipping method and gateway rows a totals table has to show. Tags
        // are stripped because the storefront prints text, never backend markup.
        foreach ($order->get_order_item_totals() as $row) {
            $totals[] = array(
                'label' => rtrim(trim(wp_strip_all_tags((string) ($row['label'] ?? ''))), ':'),
                'value' => trim(html_entity_decode(wp_strip_all_tags((string) ($row['value'] ?? '')), ENT_QUOTES, 'UTF-8')),
            );
        }

        $downloads = array();

        foreach (self::downloads_for($user_id) as $download) {
            if ($download['order_id'] === $order->get_id()) {
                $downloads[] = $download;
            }
        }

        $paid      = $order->get_date_paid();
        $completed = $order->get_date_completed();
        $decimals  = wc_get_price_decimals();

        // Merged over the summary, so the detail panel and the list share one
        // renderer for everything above the fold. items is deliberately last:
        // the detail form of an item supersedes the name-and-quantity one.
        return rest_ensure_response(array('order' => array_merge(self::order_summary($order), array(
            'subtotal'             => wc_format_decimal($order->get_subtotal(), $decimals),
            'shipping_total'       => wc_format_decimal($order->get_shipping_total(), $decimals),
            'discount_total'       => wc_format_decimal($order->get_discount_total(), $decimals),
            'tax_total'            => wc_format_decimal($order->get_total_tax(), $decimals),
            'payment_method_title' => $order->get_payment_method_title(),
            'date_paid'            => $paid ? $paid->date('c') : null,
            'date_completed'       => $completed ? $completed->date('c') : null,
            'customer_note'        => $order->get_customer_note(),
            'needs_payment'        => (bool) $order->needs_payment(),
            'billing'              => self::address_shape($order->get_address('billing'), true),
            'shipping'             => self::address_shape($order->get_address('shipping'), false),
            'items'                => $items,
            'totals'               => $totals,
            'downloads'            => $downloads,
        ))));
    }

    /** Both saved addresses, plus only the country data the form will render. */
    public static function rest_my_addresses(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        $customer = new WC_Customer($user_id);
        $billing  = self::address_shape($customer->get_billing(), true);
        $shipping = self::address_shape($customer->get_shipping(), false);

        return rest_ensure_response(array(
            'billing'         => $billing,
            'shipping'        => $shipping,
            'countries'       => WC()->countries->get_allowed_countries(),
            'billing_states'  => self::states_for($billing['country']),
            'shipping_states' => self::states_for($shipping['country']),
        ));
    }

    /** Save one address through WC_Customer, so checkout sees the same record. */
    public static function rest_my_address(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        $type   = 'shipping' === (string) $request->get_param('type') ? 'shipping' : 'billing';
        $fields = $request->get_param('fields');
        $clean  = self::clean_address(is_array($fields) ? $fields : array(), $type);

        if (is_wp_error($clean)) {
            return $clean;
        }

        $customer = new WC_Customer($user_id);

        try {
            foreach ($clean as $key => $value) {
                $setter = 'set_' . $type . '_' . $key;

                // Guarded because WooCommerce has no shipping email setter. The
                // key is in our shape only so one form renders both addresses.
                if (method_exists($customer, $setter)) {
                    $customer->{$setter}($value);
                }
            }

            $customer->save();
        } catch (Exception $e) {
            // WC_Data_Exception means a setter rejected a value the checks above
            // let through, which is still a field problem, not a server one.
            return self::address_error(array());
        }

        return rest_ensure_response(array(
            'billing'  => self::address_shape($customer->get_billing(), true),
            'shipping' => self::address_shape($customer->get_shipping(), false),
        ));
    }

    /** That customer's downloadable files. */
    public static function rest_my_downloads(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        if (!function_exists('wc_get_customer_available_downloads')) {
            return new WP_Error('nvm_unavailable', 'Downloads are temporarily unavailable.', array('status' => 503));
        }

        return rest_ensure_response(array('downloads' => self::downloads_for($user_id)));
    }

    /** That customer's saved cards. */
    public static function rest_my_payment_methods(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        if (!class_exists('WC_Payment_Tokens')) {
            return new WP_Error('nvm_unavailable', 'Payment methods are temporarily unavailable.', array('status' => 503));
        }

        return rest_ensure_response(array('methods' => self::payment_methods_for($user_id)));
    }

    /** Forget a saved card. */
    public static function rest_my_payment_method_delete(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        $token = self::own_token($user_id, $request);

        if (is_wp_error($token)) {
            return $token;
        }

        // Through the tokens API rather than the token's own delete(), so the
        // gateway's hook fires and the card is revoked at the processor too.
        WC_Payment_Tokens::delete((int) $token->get_id());

        return rest_ensure_response(array('methods' => self::payment_methods_for($user_id)));
    }

    /** Promote a saved card to the default. */
    public static function rest_my_payment_method_default(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        $token = self::own_token($user_id, $request);

        if (is_wp_error($token)) {
            return $token;
        }

        WC_Payment_Tokens::set_users_default($user_id, (int) $token->get_id());

        return rest_ensure_response(array('methods' => self::payment_methods_for($user_id)));
    }

    /**
     * Change the password, then immediately hand back a new session.
     *
     * wp_update_user() destroys every session token the user holds, sparing only
     * the one making the request - and there is none here, because the bridge is
     * called server to server. Without minting a replacement the customer signs
     * themselves out by changing their own password.
     */
    public static function rest_my_password(WP_REST_Request $request)
    {
        $user_id = self::require_user($request);

        if (is_wp_error($user_id)) {
            return $user_id;
        }

        if (self::attempt_limited('password', (string) $user_id, 10)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        $user = get_userdata($user_id);

        if (!$user || !wp_check_password((string) $request->get_param('current_password'), $user->user_pass, $user_id)) {
            return new WP_Error('nvm_bad_password', 'That password is not correct.', array('status' => 401));
        }

        $new = (string) $request->get_param('new_password');

        if (strlen($new) < 8) {
            return new WP_Error('nvm_weak_password', 'Use a password of at least 8 characters.', array('status' => 400));
        }

        $result = wp_update_user(array('ID' => $user_id, 'user_pass' => $new));

        if (is_wp_error($result)) {
            return new WP_Error('nvm_update_failed', $result->get_error_message(), array('status' => 400));
        }

        $session = self::issue_session($user_id);

        return rest_ensure_response(array(
            'ok'      => true,
            'auth'    => $session['auth'],
            'expires' => $session['expires'],
        ));
    }

    /** Set for the duration of the reset email only. */
    public static function begin_reset_email(): void
    {
        self::$sending_reset_email = true;
    }

    public static function end_reset_email(): void
    {
        self::$sending_reset_email = false;
    }

    /**
     * Point the link in the password reset email at the storefront.
     *
     * Scoped hard on purpose. woocommerce_get_endpoint_url fires for every
     * account endpoint URL on the site - the ones WooCommerce builds for its own
     * pages and the ones a shop admin follows in wp-admin included - so an
     * unscoped rewrite here would send real WooCommerce pages to a storefront
     * route. That is a far worse failure than the dead reset link it fixes, so
     * the flag confines it to the moment the email is being rendered.
     *
     * WooCommerce appends key, id and login to whatever comes back, so the
     * customer arrives on the storefront carrying everything the reset needs.
     */
    public static function reset_password_endpoint_url($url, $endpoint)
    {
        if (!self::$sending_reset_email || 'lost-password' !== $endpoint || !self::nextjs_owns_traffic()) {
            return $url;
        }

        $frontend = self::frontend_url();

        /* A missing production storefront must not create a relative, dead
         * reset URL in a real customer's inbox. WooCommerce's own URL remains
         * usable while the headless destination is being configured. */
        if ('' === $frontend) {
            return $url;
        }

        return $frontend . self::path('account_reset_password');
    }

    /**
     * Start a password reset. Always answers ok.
     *
     * Saying whether an address is registered turns this form into an account
     * enumeration oracle, which is the same reason sign in has a single failure
     * message. The throttle is swallowed for that reason too: a 429 here would
     * still be a signal about the address behind it.
     */
    public static function rest_lost_password(WP_REST_Request $request)
    {
        $login = sanitize_text_field(trim((string) $request->get_param('email')));

        // Keyed on the address, not the IP: every bridge call arrives from the
        // storefront's one server, so an IP bucket could not tell one account's
        // attempts apart from the whole shop's.
        if ('' === $login || self::attempt_limited('lost-password', $login, 5)) {
            return rest_ensure_response(array('ok' => true));
        }

        // Username first, then the address, because customers can sign in with
        // either. This is the order WooCommerce's own form resolves them in.
        $user = get_user_by('login', $login);

        if (!$user && is_email($login)) {
            $user = get_user_by('email', $login);
        }

        if (!$user) {
            return rest_ensure_response(array('ok' => true));
        }

        // Honoured so a security plugin can still veto a reset for an account.
        $allow = apply_filters('allow_password_reset', true, $user->ID);

        if (!$allow || is_wp_error($allow)) {
            return rest_ensure_response(array('ok' => true));
        }

        $key = get_password_reset_key($user);

        if (is_wp_error($key)) {
            return rest_ensure_response(array('ok' => true));
        }

        // Deliberately not core's retrieve_password(). Nothing on this install
        // hooks retrieve_password_message, so core would send its own plain text
        // email linking to wp-login.php and WooCommerce's branded template would
        // never run - woocommerce_reset_password_notification is raised only by
        // WooCommerce's own form handler. These are the same two calls that
        // handler makes, without its dependency on $_POST and the notice store.
        WC()->mailer();
        do_action('woocommerce_reset_password_notification', $user->user_login, $key);

        return rest_ensure_response(array('ok' => true));
    }

    /** Finish a password reset. The key from the email is the only authority. */
    public static function rest_reset_password(WP_REST_Request $request)
    {
        $key   = (string) $request->get_param('key');
        $login = (string) $request->get_param('login');
        $new   = (string) $request->get_param('new_password');

        // WooCommerce's reset email carries the user id, so accept it as another
        // way of naming the account. This is not the id-as-identity the account
        // routes refuse: the key is the credential here, and
        // check_password_reset_key() validates it against this specific user, so
        // a wrong or attacker chosen id fails the check rather than granting
        // anything. WooCommerce's own reset endpoint resolves it the same way.
        if ('' === $login) {
            $user_data = get_userdata((int) $request->get_param('id'));

            // An id nobody owns leaves the login empty, which fails the key check
            // below and answers nvm_bad_reset_key - the same as a bad key. Saying
            // anything different would make this a way to test which ids exist.
            $login = $user_data ? (string) $user_data->user_login : '';
        }

        // Pre-auth and guessable by construction, so throttled on the account
        // being reset rather than on the storefront's single IP.
        if (self::attempt_limited('reset-password', $login, 10)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        if (strlen($new) < 8) {
            return new WP_Error('nvm_weak_password', 'Use a password of at least 8 characters.', array('status' => 400));
        }

        $user = check_password_reset_key($key, $login);

        if (is_wp_error($user)) {
            return new WP_Error('nvm_bad_reset_key', 'That reset link has expired. Request a new one.', array('status' => 400));
        }

        // reset_password() clears the stored key as it goes, so the link cannot be
        // replayed, and fires the hooks a password change is expected to fire.
        reset_password($user, $new);

        return rest_ensure_response(array('ok' => true));
    }
}

NVM_Headless_Bridge::boot();
