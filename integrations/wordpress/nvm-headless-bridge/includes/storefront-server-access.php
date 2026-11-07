<?php
/**
 * Let the storefront server read the catalogue and cart through a store gate.
 *
 * The card processor requires that products and prices are invisible to anyone
 * who is not signed in. On WordPress that rule is enforced by the `tpc-store`
 * gate: with browsing closed it answers 401 to every anonymous Store API call
 * and empties every anonymous product query.
 *
 * The headless storefront reads the catalogue and runs carts through that same
 * Store API, and to WordPress it is anonymous. Closing the gate would therefore
 * empty the storefront too - not only for strangers, but for the signed-in
 * customers the storefront already checked. The storefront enforces the gate
 * itself (every page without a live session goes to the sign-in page), so the
 * only caller let through here is the storefront server, identified the same
 * way every bridge route identifies it: the bridge secret in
 * `X-NVM-Bridge-Key`. A browser never holds that secret, so nothing opens for
 * the public.
 *
 * Only the Store API surfaces the storefront uses are admitted: products,
 * cart and - for orders placed on the storefront's own checkout - checkout
 * (see NVM_Storefront_Checkout). Batch and everything else stay exactly as
 * the gate left them.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Storefront_Server_Access
{
    const ROUTES = '#^/wc/store/v[0-9]+/(products|cart|checkout)(/|$)#i';

    /** The gate's refusal, the one decision this class may overturn. */
    const GATE_ERROR = 'tpc_store_gated';

    /** Memoised per request: the header cannot change mid-request. */
    private static ?bool $trusted = null;

    public static function boot(): void
    {
        // After the gate, which decides at 99.
        add_filter('rest_authentication_errors', array(self::class, 'admit'), 100);
        // After plugins_loaded, where the gate registers its query filter.
        add_action('init', array(self::class, 'keep_catalog_queries'), 1);
    }

    /** Does this request carry the bridge secret? */
    public static function trusted(): bool
    {
        if (null === self::$trusted) {
            $provided = isset($_SERVER['HTTP_X_NVM_BRIDGE_KEY'])
                ? (string) wp_unslash($_SERVER['HTTP_X_NVM_BRIDGE_KEY'])
                : '';
            self::$trusted = '' !== $provided
                && hash_equals(NVM_Headless_Bridge::secret(), $provided);
        }
        return self::$trusted;
    }

    /**
     * Overturn the gate's refusal for the storefront server, on products and cart.
     *
     * @param mixed $result WP_Error, true, or null from earlier filters.
     * @return mixed
     */
    public static function admit($result)
    {
        if (!is_wp_error($result) || self::GATE_ERROR !== $result->get_error_code()) {
            return $result;
        }
        if (!self::trusted() || !preg_match(self::ROUTES, self::route())) {
            return $result;
        }
        return true;
    }

    /**
     * The gate empties product queries for anonymous callers. For the storefront
     * server that would turn an admitted catalogue read into an empty list, so
     * the filter is removed for its requests only.
     */
    public static function keep_catalog_queries(): void
    {
        if (!self::trusted() || !class_exists('TPC_Store_Module_Gate_Enforcement')) {
            return;
        }
        remove_action('pre_get_posts', array('TPC_Store_Module_Gate_Enforcement', 'empty_catalog_for_anon'));
    }

    /** The REST route of this request, e.g. "/wc/store/v1/products". */
    public static function route(): string
    {
        $prefix = rest_get_url_prefix();
        $uri    = isset($_SERVER['REQUEST_URI']) ? (string) wp_unslash($_SERVER['REQUEST_URI']) : '';
        $path   = (string) wp_parse_url($uri, PHP_URL_PATH);
        $marker = '/' . $prefix . '/';
        $at     = strpos($path, $marker);
        if (false !== $at) {
            return '/' . ltrim(substr($path, $at + strlen($marker)), '/');
        }
        if (isset($_GET['rest_route'])) { // phpcs:ignore WordPress.Security.NonceVerification
            return '/' . ltrim(sanitize_text_field(wp_unslash($_GET['rest_route'])), '/'); // phpcs:ignore WordPress.Security.NonceVerification
        }
        return '';
    }
}
