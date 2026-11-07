<?php
/**
 * Publish the shop's real free-shipping rule.
 *
 * The Store API describes a cart, not the shipping zones behind it: it will
 * tell you which rates a cart has *earned*, never the amount it still has to
 * reach to earn them. So the storefront's "you are $X away from free shipping"
 * meter had nothing to read, and was keyed to a hand-copied environment
 * variable instead - a number that had to be re-typed on the frontend every
 * time somebody changed the zone in WooCommerce, and that silently promised
 * the wrong threshold the moment the two drifted apart.
 *
 * This closes that. WooCommerce owns the number; the storefront asks for it.
 *
 * Public on purpose: a shipping threshold is something the shop advertises to
 * anybody, so reading it should not require the bridge key.
 *
 * @package NVM_Headless_Bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

class NVM_Shipping_Rules
{
    /** Zones change a few times a year; the read is cheap but not free. */
    const CACHE_KEY = 'nvm_free_shipping_rule';
    const CACHE_TTL = 300;

    public static function boot(): void
    {
        add_action('rest_api_init', array(self::class, 'register_route'));

        // Any edit to a zone, a method, or a method's settings invalidates the
        // published answer immediately. Waiting out the TTL would leave the
        // storefront advertising a threshold the till had already stopped
        // honouring, which is the exact failure this endpoint exists to end.
        foreach (array(
            'woocommerce_shipping_zone_method_added',
            'woocommerce_shipping_zone_method_deleted',
            'woocommerce_shipping_zone_method_status_toggled',
            'woocommerce_after_shipping_zone_object_save',
            'woocommerce_update_options_shipping',
            'update_option_woocommerce_currency',
        ) as $hook) {
            add_action($hook, array(self::class, 'flush'));
        }

        // Instance settings are stored per method as their own option row.
        add_action('updated_option', array(self::class, 'flush_on_method_option'), 10, 1);
    }

    public static function flush(): void
    {
        delete_transient(self::CACHE_KEY);
    }

    /** @param string $option */
    public static function flush_on_method_option($option): void
    {
        if (0 === strpos((string) $option, 'woocommerce_free_shipping_')
            || 0 === strpos((string) $option, 'woocommerce_flat_rate_')) {
            self::flush();
        }
    }

    /* ---------------------------------------------------------------- rule */

    /**
     * The cheapest free-shipping threshold anywhere in the shop.
     *
     * "Anywhere" rather than "in the visitor's zone" is deliberate. The meter
     * is shown in the cart, long before an address exists, so there is no zone
     * to resolve yet. Publishing the lowest threshold keeps the promise on the
     * page one the checkout can always keep: no buyer is ever told a smaller
     * number than the one they will actually be charged against.
     *
     * @return array{enabled:bool,min_amount:float|null,requires:string,ignore_discounts:bool,currency:string}
     */
    public static function rule(): array
    {
        $cached = get_transient(self::CACHE_KEY);

        if (is_array($cached)) {
            return $cached;
        }

        $rule = array(
            'enabled'          => false,
            'min_amount'       => null,
            'requires'         => '',
            'ignore_discounts' => false,
            'currency'         => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
        );

        if (class_exists('WC_Shipping_Zones')) {
            foreach (self::every_zone() as $zone) {
                foreach ($zone->get_shipping_methods(true) as $method) {
                    if ('free_shipping' !== $method->id) {
                        continue;
                    }

                    $requires = (string) ($method->get_option('requires') ?: '');

                    // A free-shipping method that needs no minimum is free from
                    // the first item. There is nothing to make progress toward,
                    // so it is reported as enabled with no threshold and the
                    // storefront draws no meter.
                    if (!in_array($requires, array('min_amount', 'either', 'both'), true)) {
                        $rule['enabled'] = true;

                        if ('' === $rule['requires']) {
                            $rule['requires'] = $requires;
                        }

                        continue;
                    }

                    $min = (float) $method->get_option('min_amount');

                    if ($min <= 0) {
                        continue;
                    }

                    if (null === $rule['min_amount'] || $min < $rule['min_amount']) {
                        $rule['min_amount']       = $min;
                        $rule['requires']         = $requires;
                        // WooCommerce compares its minimum against the subtotal
                        // *after* discounts unless this is on. The storefront
                        // has to do the same arithmetic or its meter fills at a
                        // different moment than the checkout's rate appears.
                        $rule['ignore_discounts'] = 'yes' === $method->get_option('ignore_discounts');
                    }

                    $rule['enabled'] = true;
                }
            }
        }

        set_transient(self::CACHE_KEY, $rule, self::CACHE_TTL);

        return $rule;
    }

    /** Every zone including "Rest of the world", which get_zones() omits. */
    private static function every_zone(): array
    {
        $zones = array();

        foreach (WC_Shipping_Zones::get_zones() as $data) {
            $zone = WC_Shipping_Zones::get_zone((int) $data['zone_id']);

            if ($zone) {
                $zones[] = $zone;
            }
        }

        $rest = WC_Shipping_Zones::get_zone(0);

        if ($rest) {
            $zones[] = $rest;
        }

        return $zones;
    }

    /* ------------------------------------------------------------- publish */

    public static function register_route(): void
    {
        register_rest_route('nvm/v1', '/shipping-rule', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => static function () {
                $res = rest_ensure_response(self::rule());
                $res->header('Cache-Control', 'public, max-age=60');

                return $res;
            },
        ));
    }
}
