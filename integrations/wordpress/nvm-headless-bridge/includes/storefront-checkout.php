<?php
/**
 * Orders placed on the storefront's own checkout, paid on the storefront.
 *
 * The storefront takes the card payment itself (Tagada, from its own checkout
 * page). WooCommerce still makes the order, from the same Store API cart the
 * storefront has been writing to, through its own Store API checkout: so
 * coupons, shipping, stock reservation and totals are exactly what WooCommerce
 * would have produced on its own checkout page. The order is then left
 * "Pending payment" until the storefront reports the payment, and only then
 * marked paid - which is when stock is reduced, emails are sent and every
 * order-status hook (tracking included) fires, as for any other gateway.
 *
 * Everything here answers only to the storefront server, identified by the
 * bridge secret as every bridge route is, and only on behalf of a customer
 * whose WordPress session it presents. Nothing opens for browsers.
 *
 * Three pieces:
 *  1. The Store API checkout route admits the storefront server (see
 *     NVM_Storefront_Server_Access) and, for that request only, a guest
 *     checkout is permitted so WooCommerce does not try to sign anyone in;
 *     the order is assigned to the presented customer instead.
 *  2. A payment method, "Card (storefront)", that exists only for those
 *     requests: it records the order as awaiting payment and takes nothing.
 *  3. `POST /nvm/v1/checkout/complete` and `/checkout/fail`, which the
 *     storefront calls once Tagada has settled the payment.
 *
 * @package NVM_Headless_Bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Storefront_Checkout
{
    const GATEWAY_ID = 'nvm_storefront_card';

    /** The customer's WordPress logged-in cookie value, sent by the storefront server. */
    const CUSTOMER_HEADER = 'HTTP_X_NVM_CUSTOMER_AUTH';

    const META_PAYMENT_ID = '_nvm_storefront_payment_id';
    const META_PROVIDER   = '_nvm_storefront_payment_provider';
    const META_OPT_IN     = '_nvm_storefront_marketing_opt_in';
    const META_WALLET     = '_nvm_storefront_wallet';
    const WALLET_LABELS   = array('card' => 'Card', 'apple_pay' => 'Apple Pay', 'google_pay' => 'Google Pay');

    /** Memoised per request: the header and route cannot change mid-request. */
    private static ?int $customer = null;

    public static function boot(): void
    {
        add_filter('woocommerce_payment_gateways', array(self::class, 'register_gateway'));
        add_filter('woocommerce_checkout_registration_required', array(self::class, 'registration_required'), PHP_INT_MAX);
        add_action('rest_api_init', array(self::class, 'register_routes'));
        // The shopper's own IP and browser (2.7.3), sent by the storefront server.
        add_action('woocommerce_blocks_loaded', array(self::class, 'register_shopper_schema'));
        if (did_action('woocommerce_blocks_loaded')) {
            self::register_shopper_schema();
        }
        add_action('woocommerce_store_api_checkout_update_order_from_request', array(self::class, 'apply_shopper'), 20, 2);
        // Again once the order is processed, after any language plugin stamped its own (2.7.5).
        add_action('woocommerce_store_api_checkout_order_processed', array(self::class, 'apply_language'), 99);
    }

    /** The language the storefront placed the current order in, for apply_language(). */
    private static string $language = '';

    /** The Store API extension the storefront sends the shopper in: "extensions": {"nvm-shopper": {ip, user_agent}}. */
    const SHOPPER_NAMESPACE = 'nvm-shopper';

    /**
     * Let the Store API checkout take the `nvm-shopper` extension. Without a
     * registered schema the extension would not reach the order.
     */
    public static function register_shopper_schema(): void
    {
        static $done = false;
        if ($done || !function_exists('woocommerce_store_api_register_endpoint_data')
            || !class_exists('Automattic\WooCommerce\StoreApi\Schemas\V1\CheckoutSchema')) {
            return;
        }
        $done = true;
        woocommerce_store_api_register_endpoint_data(array(
            'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\CheckoutSchema::IDENTIFIER,
            'namespace'       => self::SHOPPER_NAMESPACE,
            'schema_callback' => static function () {
                return array(
                    'ip'         => array('description' => 'The shopper\'s IP address (storefront server only).', 'type' => array('string', 'null'), 'context' => array()),
                    'user_agent' => array('description' => 'The shopper\'s browser (storefront server only).', 'type' => array('string', 'null'), 'context' => array()),
                    'lang'       => array('description' => 'The storefront language the order was placed in (storefront server only).', 'type' => array('string', 'null'), 'context' => array()),
                );
            },
        ));
    }

    /**
     * The shopper's IP address and browser onto the order, in WooCommerce's own
     * fields. The order request comes from the storefront server, so without
     * this the order would carry the server's address, and the capture and
     * matching plugins (Stape webhook, capi-connector, the feeds) read those
     * fields. Only for the storefront's own checkout (bridge key, a valid
     * customer session); a browser cannot set them.
     *
     * @param WC_Order $order
     * @param WP_REST_Request $request
     */
    public static function apply_shopper($order, $request): void
    {
        if (self::customer_id() < 1 || !is_object($order) || !is_object($request)) {
            return;
        }
        $extensions = $request->get_param('extensions');
        $shopper = is_array($extensions) ? ($extensions[self::SHOPPER_NAMESPACE] ?? null) : null;
        if (!is_array($shopper)) {
            return;
        }
        $ip = trim((string) ($shopper['ip'] ?? ''));
        if ('' !== $ip && false !== filter_var($ip, FILTER_VALIDATE_IP)) {
            $order->set_customer_ip_address($ip);
        }
        $agent = substr(preg_replace('/[\x00-\x1f\x7f]/', '', (string) ($shopper['user_agent'] ?? '')), 0, 500);
        if ('' !== $agent) {
            $order->set_customer_user_agent($agent);
        }
        /* The order's language (2.7.5). The storefront sends English product
           IDs, so WPML cannot tell a Spanish order by its items; without this a
           Spanish customer gets English emails and reminders. Only a language
           WPML runs is stored. */
        $lang = NVM_Headless_Bridge::known_locale((string) ($shopper['lang'] ?? ''));
        if ('' !== $lang) {
            self::$language = $lang;
            $order->update_meta_data('wpml_language', $lang);
        }
    }

    /** Re-stamp the order's language after checkout, in case a language plugin overwrote it. */
    public static function apply_language($order): void
    {
        if ('' === self::$language || !$order instanceof WC_Order || self::customer_id() < 1) {
            return;
        }
        if ($order->get_meta('wpml_language') !== self::$language) {
            $order->update_meta_data('wpml_language', self::$language);
            $order->save_meta_data();
        }
    }

    /**
     * The customer this Store API checkout is placed for, or 0.
     *
     * Non-zero only when all three hold: the request carries the bridge secret,
     * it is the Store API checkout route, and it presents a WordPress session
     * that is still valid. Anything else - a browser, another route, an expired
     * session - is 0, and nothing in this class changes WooCommerce's behaviour.
     */
    public static function customer_id(): int
    {
        if (null !== self::$customer) {
            return self::$customer;
        }
        self::$customer = 0;
        if (!NVM_Storefront_Server_Access::trusted()) {
            return 0;
        }
        if (!preg_match('#^/wc/store/v[0-9]+/checkout/?$#i', NVM_Storefront_Server_Access::route())) {
            return 0;
        }
        $auth = isset($_SERVER[self::CUSTOMER_HEADER]) ? (string) wp_unslash($_SERVER[self::CUSTOMER_HEADER]) : '';
        if ('' === $auth) {
            return 0;
        }
        self::$customer = (int) wp_validate_auth_cookie($auth, 'logged_in');
        return self::$customer;
    }

    /**
     * Let the storefront's signed-in customer check out without WooCommerce
     * signing them in or registering them: the store requires an account, and
     * the storefront has already checked that they have one.
     *
     * @param mixed $required
     * @return mixed
     */
    public static function registration_required($required)
    {
        return self::customer_id() > 0 ? false : $required;
    }

    /** @param array $gateways */
    public static function register_gateway($gateways): array
    {
        if (class_exists('WC_Payment_Gateway')) {
            require_once __DIR__ . '/storefront-card-gateway.php';
            $gateways[] = 'NVM_Storefront_Card_Gateway';
        }
        return (array) $gateways;
    }

    /* ------------------------------------------------------------- routes */

    public static function register_routes(): void
    {
        $args = array(
            'auth'       => array('type' => 'string', 'required' => true),
            'order_id'   => array('type' => 'integer', 'required' => true),
            'order_key'  => array('type' => 'string', 'required' => true),
            'payment_id' => array('type' => 'string', 'required' => true),
        );

        register_rest_route(NVM_Headless_Bridge::REST_NS, '/checkout/complete', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_complete'),
            'permission_callback' => array('NVM_Headless_Bridge', 'rest_permission'),
            'args'                => $args + array(
                // Minor units: what the storefront charged. Must equal the order total.
                'amount'   => array('type' => 'integer', 'required' => true),
                'currency' => array('type' => 'string', 'required' => true),
            ),
        ));

        register_rest_route(NVM_Headless_Bridge::REST_NS, '/checkout/fail', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_fail'),
            'permission_callback' => array('NVM_Headless_Bridge', 'rest_permission'),
            'args'                => $args,
        ));
    }

    /**
     * The order, if it is this customer's, carries this key, and was placed
     * through the storefront card method. Anything else answers like a missing
     * order, so this cannot be used to probe other orders.
     *
     * @return WC_Order|WP_Error
     */
    private static function owned_order(WP_REST_Request $request)
    {
        if (!function_exists('wc_get_order')) {
            return new WP_Error('nvm_unavailable', 'Orders are temporarily unavailable.', array('status' => 503));
        }
        $user_id = (int) wp_validate_auth_cookie((string) $request->get_param('auth'), 'logged_in');
        if ($user_id < 1) {
            return new WP_Error('nvm_unauthenticated', 'Not signed in.', array('status' => 401));
        }
        $order = wc_get_order((int) $request->get_param('order_id'));
        $key   = (string) $request->get_param('order_key');
        if (!$order instanceof WC_Order
            || (int) $order->get_customer_id() !== $user_id
            || '' === $key || !hash_equals((string) $order->get_order_key(), $key)
            || self::GATEWAY_ID !== $order->get_payment_method()) {
            return new WP_Error('nvm_not_found', 'No such order.', array('status' => 404));
        }
        return $order;
    }

    private static function payment_id(WP_REST_Request $request): string
    {
        $id = (string) $request->get_param('payment_id');
        return preg_match('/\A[A-Za-z0-9_-]{4,64}\z/', $id) ? $id : '';
    }

    /** What the storefront needs back: enough to show the receipt. */
    private static function state(WC_Order $order): array
    {
        return array(
            'order_id'     => (int) $order->get_id(),
            'order_number' => (string) $order->get_order_number(),
            'status'       => (string) $order->get_status(),
            'paid'         => !$order->needs_payment() && null !== $order->get_date_paid(),
        );
    }

    /**
     * Mark the order paid with the storefront's payment.
     *
     * Idempotent: an order already paid with this payment answers as it is.
     * The amount must match the order to the cent, so a payment for one basket
     * can never settle a different, larger order.
     */
    public static function rest_complete(WP_REST_Request $request)
    {
        $order = self::owned_order($request);
        if (is_wp_error($order)) {
            return $order;
        }
        $payment_id = self::payment_id($request);
        if ('' === $payment_id) {
            return new WP_Error('nvm_invalid_payment', 'Invalid payment reference.', array('status' => 400));
        }

        if (!$order->needs_payment()) {
            if ((string) $order->get_meta(self::META_PAYMENT_ID) === $payment_id) {
                return rest_ensure_response(self::state($order));
            }
            return new WP_Error('nvm_already_paid', 'This order has already been paid.', array('status' => 409));
        }

        $expected = (int) round((float) $order->get_total() * (10 ** wc_get_price_decimals()));
        $currency = strtoupper((string) $request->get_param('currency'));
        if ((int) $request->get_param('amount') !== $expected || $currency !== strtoupper($order->get_currency())) {
            $order->add_order_note(sprintf(
                'Storefront payment %s was not applied: it was for %s %s, the order is for %s %s.',
                $payment_id,
                number_format((int) $request->get_param('amount') / (10 ** wc_get_price_decimals()), wc_get_price_decimals()),
                $currency,
                $order->get_total(),
                $order->get_currency()
            ));
            return new WP_Error('nvm_amount_mismatch', 'The payment does not match the order total.', array('status' => 409));
        }

        /* How it was paid (2.7.5): card, apple_pay or google_pay. The store
           reports Apple Pay separately (the agency's Oct 12 reply). Anything
           else, or nothing, is a card. */
        $wallet = (string) $request->get_param('wallet');
        $wallet = in_array($wallet, array('card', 'apple_pay', 'google_pay'), true) ? $wallet : 'card';

        $order->update_meta_data(self::META_PAYMENT_ID, $payment_id);
        $order->update_meta_data(self::META_PROVIDER, 'tagada');
        $order->update_meta_data(self::META_WALLET, $wallet);
        $order->add_order_note(sprintf('%s payment received on the storefront (Tagada payment %s).', self::WALLET_LABELS[$wallet], $payment_id));
        // WooCommerce's own completion: status, paid date, transaction id,
        // stock reduction, emails and every hook that listens for a payment.
        $order->payment_complete($payment_id);

        return rest_ensure_response(self::state(wc_get_order($order->get_id())));
    }

    /** A declined or abandoned card payment: the order is marked failed, as any gateway would. */
    public static function rest_fail(WP_REST_Request $request)
    {
        $order = self::owned_order($request);
        if (is_wp_error($order)) {
            return $order;
        }
        if ($order->needs_payment() && !$order->has_status('failed')) {
            $payment_id = self::payment_id($request);
            $order->update_status(
                'failed',
                $payment_id ? sprintf('Card payment declined on the storefront (Tagada payment %s).', $payment_id)
                    : 'Card payment was not completed on the storefront.'
            );
        }
        return rest_ensure_response(self::state($order));
    }
}
