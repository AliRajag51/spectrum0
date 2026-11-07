<?php
/**
 * Account cart recovery for the shared headless protocol.
 *
 * Checkout moves a guest WooCommerce session onto the authenticated customer
 * and deletes the guest row. This endpoint gives the storefront the signed
 * Cart-Token for the surviving account session. It belongs in the core because
 * every storefront using the handoff has the same recovery requirement.
 */

defined( 'ABSPATH' ) || exit;

final class NVM_Account_Cart {
	public static function boot(): void {
		add_action( 'rest_api_init', array( self::class, 'register_route' ) );
	}

	public static function register_route(): void {
		register_rest_route(
			NVM_Headless_Bridge::REST_NS,
			'/account-cart-token',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( 'NVM_Headless_Bridge', 'rest_permission' ),
				'callback'            => array( self::class, 'respond' ),
				'args'                => array(
					'auth' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
	}

	public static function respond( WP_REST_Request $request ) {
		$utils = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartTokenUtils';

		if ( ! class_exists( $utils ) || ! class_exists( 'WC_Session_Handler' ) ) {
			return new WP_Error( 'nvm_unavailable', 'Store API unavailable.', array( 'status' => 503 ) );
		}

		$user_id = (int) wp_validate_auth_cookie( (string) $request->get_param( 'auth' ), 'logged_in' );

		if ( $user_id < 1 ) {
			return new WP_Error( 'nvm_unauthenticated', 'Session expired.', array( 'status' => 401 ) );
		}

		$previous_user = get_current_user_id();
		try {
			wp_set_current_user( $user_id );
			$count = self::items( $user_id );
		} catch ( Throwable $error ) {
			// An unreadable or concurrently changed basket is never an empty basket.
			return new WP_Error( 'nvm_cart_unavailable', 'Account cart temporarily unavailable.', array( 'status' => 503 ) );
		} finally {
			wp_set_current_user( $previous_user );
		}

		return rest_ensure_response(
			array(
				'cart_token'  => $utils::get_cart_token( (string) $user_id ),
				'items_count' => $count,
			)
		);
	}

	private static function items( int $user_id ): int {
		global $wpdb;
		$table = $wpdb->prefix . 'woocommerce_sessions';
		// Match the token handler's database source, not the cookie handler's cache.
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT session_value FROM %i WHERE session_key = %s', $table, (string) $user_id ), ARRAY_A );
		self::require_database_read();
		if ( null !== $row ) {
			$session = self::decode_array( $row['session_value'] );
			$lines = isset( $session['cart'] ) ? self::decode_array( $session['cart'] ) : array();
			// An existing session is authoritative, including an intentional clear.
			// Never use stale persistent metadata to fill an existing empty session.
			return empty( $lines ) ? 0 : self::validated_cart( $user_id, $session )['count'];
		}

		if ( ! apply_filters( 'woocommerce_persistent_cart_enabled', true ) ) {
			return 0;
		}
		$meta = $wpdb->get_results( $wpdb->prepare( 'SELECT umeta_id, meta_value FROM %i WHERE user_id = %d AND meta_key = %s', $wpdb->usermeta, $user_id, '_woocommerce_persistent_cart_' . get_current_blog_id() ), ARRAY_A );
		self::require_database_read();
		if ( empty( $meta ) ) {
			return 0;
		}
		if ( count( $meta ) !== 1 ) {
			throw new RuntimeException( 'Ambiguous saved cart.' );
		}
		$saved = self::decode_array( $meta[0]['meta_value'] );
		$lines = isset( $saved['cart'] ) ? self::decode_array( $saved['cart'] ) : array();
		if ( empty( $lines ) ) {
			return 0;
		}

		$cart = self::validated_cart( $user_id, array( 'cart' => $lines ) );
		// Woo's ordinary save is an unconditional upsert. Recovery must only INSERT:
		// a concurrent add, clear or checkout creating this row must always win.
		// Also require the saved metadata to still exist and be byte-identical.
		$inserted = $wpdb->query( $wpdb->prepare(
			'INSERT INTO %i (session_key, session_value, session_expiry) SELECT %s, %s, %d FROM %i WHERE umeta_id = %d AND BINARY meta_value = BINARY %s ON DUPLICATE KEY UPDATE session_key = session_key',
			$table, (string) $user_id, maybe_serialize( $cart['session'] ), \Automattic\WooCommerce\StoreApi\Utilities\CartTokenUtils::get_cart_token_expiration(),
			$wpdb->usermeta, (int) $meta[0]['umeta_id'], $meta[0]['meta_value']
		) );
		if ( 1 !== $inserted ) {
			throw new RuntimeException( 'Saved cart changed during recovery.' );
		}
		wp_cache_delete( WC_Cache_Helper::get_cache_prefix( WC_SESSION_CACHE_GROUP ) . $user_id, WC_SESSION_CACHE_GROUP );
		return $cart['count'];
	}

	private static function require_database_read(): void {
		global $wpdb;
		if ( $wpdb->last_error !== '' ) {
			throw new RuntimeException( 'Cart storage unavailable.' );
		}
	}

	private static function decode_array( $value ): array {
		$data = maybe_unserialize( $value );
		if ( ! is_array( $data ) ) {
			throw new RuntimeException( 'Unreadable cart storage.' );
		}
		return $data;
	}

	/** Validate saved lines with WooCommerce without borrowing the request's cart. */
	private static function validated_cart( int $user_id, array $data ): array {
		global $wp_filter, $wp_actions, $wp_current_filter;
		$lines = self::decode_array( $data['cart'] );
		foreach ( $lines as $key => $line ) {
			if ( ! is_array( $line ) || ! isset( $line['key'], $line['product_id'], $line['variation_id'], $line['variation'], $line['quantity'] ) || $line['key'] !== $key || ! is_numeric( $line['quantity'] ) || ! is_array( $line['variation'] ) ) {
				throw new RuntimeException( 'Unreadable cart line.' );
			}
		}
		$old_user = get_current_user_id();
		$old_session = WC()->session;
		$old_cart = WC()->cart;
		$old_customer = WC()->customer;
		$old_get = $_GET;
		$action_counts = $wp_actions;
		$filter_stack = $wp_current_filter;
		// WC_Cart registers request and shutdown hooks. Restore them even on failure,
		// so the temporary cart cannot later save into another customer's session.
		$hooks = array();
		foreach ( $wp_filter as $name => $hook ) {
			$hooks[$name] = clone $hook;
		}
		try {
			// Existing cart callbacks hold their own cart object but write through
			// WC()->session. Do not let them write into the temporary session.
			foreach ( $wp_filter as $name => $hook ) {
				foreach ( $hook->callbacks as $priority => $callbacks ) {
					foreach ( $callbacks as $callback ) {
						$fn = $callback['function'];
						if ( is_array( $fn ) && ( $fn[0] instanceof WC_Cart || $fn[0] instanceof WC_Cart_Session ) ) {
							remove_filter( $name, $fn, $priority );
						}
					}
				}
			}
			wp_set_current_user( $user_id );
			WC()->session = new class( $user_id, $data ) extends WC_Session {
				public function __construct( $id, $data ) { $this->_customer_id = (string) $id; $this->_data = $data; }
				public function has_session() { return true; }
				public function export(): array { return $this->_data; }
			};
			WC()->customer = new WC_Customer( $user_id );
			// Seeded lines already identify the chosen source. Prevent login merging
			// and persistent-meta writes while validating this isolated snapshot.
			add_filter( 'woocommerce_persistent_cart_enabled', '__return_false', PHP_INT_MAX );
			add_filter( 'get_user_metadata', static function ( $value, $id, $key ) use ( $user_id ) {
				return (int) $id === $user_id && $key === '_woocommerce_load_saved_cart_after_login' ? false : $value;
			}, PHP_INT_MAX, 3 );
			unset( $_GET['order_again'] );
			WC()->cart = new WC_Cart();
			$loader = new WC_Cart_Session( WC()->cart );
			$loader->get_cart_from_session();
			$loader->set_session();
			$session = WC()->session->export();
			// Retain an explicit empty cart after Woo removes invalid saved products.
			$session['cart'] = maybe_serialize( $loader->get_cart_for_session() );
			return array( 'session' => $session, 'count' => WC()->cart->get_cart_contents_count() );
		} finally {
			$wp_filter = $hooks;
			// Woo's lazy cart loader also consults did_action(). Temporary validation
			// must not tell a later real cart that it has already been loaded.
			$wp_actions = $action_counts;
			$wp_current_filter = $filter_stack;
			WC()->session = $old_session;
			WC()->cart = $old_cart;
			WC()->customer = $old_customer;
			$_GET = $old_get;
			wp_set_current_user( $old_user );
		}
	}
}
