<?php
/**
 * Once a cart earns free shipping, offer only free shipping.
 *
 * WooCommerce lists every rate a cart qualifies for, so above the free
 * threshold the shopper saw "Free shipping" beside the $10 flat rate. The
 * flat rate is dropped whenever a free_shipping rate is present; local pickup
 * would be kept, should the shop ever add it. Below the threshold nothing
 * changes. The Store API reads the same filtered rates, so the storefront and
 * the WordPress checkout agree.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Free_Shipping_Only {

	public static function boot(): void {
		add_filter( 'woocommerce_package_rates', array( self::class, 'filter' ), 100, 1 );
	}

	/**
	 * @param array<string, WC_Shipping_Rate> $rates
	 * @return array<string, WC_Shipping_Rate>
	 */
	public static function filter( $rates ) {
		if ( ! is_array( $rates ) ) {
			return $rates;
		}

		$kept = array();
		foreach ( $rates as $id => $rate ) {
			if ( $rate instanceof WC_Shipping_Rate
				&& in_array( $rate->get_method_id(), array( 'free_shipping', 'local_pickup', 'pickup_location' ), true ) ) {
				$kept[ $id ] = $rate;
			}
		}

		$has_free = false;
		foreach ( $kept as $rate ) {
			if ( 'free_shipping' === $rate->get_method_id() ) {
				$has_free = true;
				break;
			}
		}

		return $has_free ? $kept : $rates;
	}
}
