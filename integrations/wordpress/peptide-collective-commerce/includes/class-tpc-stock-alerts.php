<?php
/**
 * Restock alerts.
 *
 * A customer who finds a strength out of stock leaves an email address. The
 * storefront files it here over `wc-tpc/v1` on its store credential, and
 * WooCommerce's own stock-status hooks send one email when that strength is
 * back. The list lives in WooCommerce rather than in the storefront because
 * WooCommerce is the only thing that sees the status flip the moment it
 * happens - from the admin, from a REST update, from an order being cancelled.
 *
 * One email per request. The row is claimed before the message is sent, so a
 * second runner cannot send it twice; and a row whose target is not actually
 * in stock when the job runs is left waiting rather than consumed.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Stock_Alerts {

	const DB_VERSION            = '1';
	const OPTION_DB             = 'tpc_stock_alerts_db_version';
	/** Storefront origin for email links. Falls back to the bridge's, then to the WordPress permalink. */
	const OPTION_ORIGIN         = 'tpc_storefront_url';
	const HOOK_SEND             = 'tpc_stock_alerts_send';
	const GROUP                 = 'peptide-collective-commerce';
	const BATCH                 = 50;
	const MAX_PENDING_PER_EMAIL = 25;
	const ADMIN_PAGE            = 'tpc-stock-alerts';

	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'tpc_stock_alerts';
	}

	public static function boot(): void {
		add_action( 'plugins_loaded', array( self::class, 'maybe_install' ) );
		add_action( 'rest_api_init', array( self::class, 'register_routes' ) );
		add_action( 'woocommerce_variation_set_stock_status', array( self::class, 'on_variation_stock_status' ), 10, 3 );
		add_action( 'woocommerce_product_set_stock_status', array( self::class, 'on_product_stock_status' ), 10, 3 );
		add_action( self::HOOK_SEND, array( self::class, 'send' ), 10, 3 );
		add_action( 'admin_menu', array( self::class, 'admin_menu' ), 60 );
	}

	/* ---------------------------------------------------------------- Storage */

	/** Installs on first load after an upgrade too, since an in-place file update never runs activation. */
	public static function maybe_install(): void {
		if ( get_option( self::OPTION_DB ) === self::DB_VERSION ) {
			return;
		}
		self::install();
	}

	public static function install(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = self::table();
		$charset = $wpdb->get_charset_collate();

		// dbDelta is particular: one column per line, two spaces after PRIMARY KEY.
		dbDelta(
			"CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  product_id bigint(20) unsigned NOT NULL,
  variation_id bigint(20) unsigned NOT NULL DEFAULT 0,
  email varchar(190) NOT NULL,
  created_at datetime NOT NULL,
  notified_at datetime NULL DEFAULT NULL,
  PRIMARY KEY  (id),
  KEY target (product_id,variation_id,notified_at),
  KEY email (email)
) {$charset};"
		);

		update_option( self::OPTION_DB, self::DB_VERSION );
	}

	/** The storefront's own reading of "in stock": the status, not "purchasable". */
	private static function is_available( WC_Product $product ): bool {
		return 'instock' === $product->get_stock_status() && 'publish' === $product->get_status();
	}

	/* ------------------------------------------------------------------- REST */

	/**
	 * `POST /wp-json/wc-tpc/v1/stock-alerts`.
	 *
	 * The `wc-` namespace is what makes WooCommerce apply its consumer-key
	 * authentication to a third-party route, so the storefront reaches this
	 * on the credential it already holds and a browser cannot reach it at all.
	 */
	public static function register_routes(): void {
		register_rest_route(
			'wc-tpc/v1',
			'/stock-alerts',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( self::class, 'rest_create' ),
				'permission_callback' => static function () {
					return current_user_can( 'manage_woocommerce' );
				},
				'args'                => array(
					'product_id'   => array(
						'type'     => 'integer',
						'required' => true,
						'minimum'  => 1,
					),
					'variation_id' => array(
						'type'    => 'integer',
						'default' => 0,
						'minimum' => 0,
					),
					'email'        => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
	}

	public static function rest_create( WP_REST_Request $request ) {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return new WP_Error( 'tpc_no_woocommerce', __( 'The store is not available right now.', 'peptide-collective-commerce' ), array( 'status' => 503 ) );
		}

		$email        = sanitize_email( (string) $request['email'] );
		$product_id   = (int) $request['product_id'];
		$variation_id = (int) $request['variation_id'];

		if ( ! is_email( $email ) ) {
			return new WP_Error( 'tpc_invalid_email', __( 'Enter a valid email address.', 'peptide-collective-commerce' ), array( 'status' => 400 ) );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product instanceof WC_Product || $product->is_type( 'variation' ) || 'publish' !== $product->get_status() ) {
			return new WP_Error( 'tpc_unknown_product', __( 'That product is no longer available.', 'peptide-collective-commerce' ), array( 'status' => 404 ) );
		}

		$target = $product;
		if ( $variation_id > 0 ) {
			$variation = wc_get_product( $variation_id );
			if ( ! $variation instanceof WC_Product_Variation || $variation->get_parent_id() !== $product_id ) {
				return new WP_Error( 'tpc_unknown_variation', __( 'That strength is no longer available.', 'peptide-collective-commerce' ), array( 'status' => 404 ) );
			}
			$target = $variation;
		}

		$answer = array(
			'product_id'   => $product_id,
			'variation_id' => $variation_id,
		);

		// The storefront's catalogue can be a few minutes behind; say so rather
		// than file an alert for a message that would never be sent.
		if ( self::is_available( $target ) ) {
			return rest_ensure_response( $answer + array( 'status' => 'in_stock' ) );
		}

		global $wpdb;
		$table = self::table();

		$existing = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE product_id = %d AND variation_id = %d AND email = %s AND notified_at IS NULL LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$product_id,
				$variation_id,
				$email
			)
		);
		if ( $existing > 0 ) {
			return rest_ensure_response( $answer + array( 'status' => 'already_subscribed' ) );
		}

		$pending = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE email = %s AND notified_at IS NULL", $email ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		);
		if ( $pending >= self::MAX_PENDING_PER_EMAIL ) {
			return new WP_Error( 'tpc_too_many', __( 'That address already has a number of alerts waiting.', 'peptide-collective-commerce' ), array( 'status' => 429 ) );
		}

		$inserted = $wpdb->insert(
			$table,
			array(
				'product_id'   => $product_id,
				'variation_id' => $variation_id,
				'email'        => $email,
				'created_at'   => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s' )
		);
		if ( false === $inserted ) {
			return new WP_Error( 'tpc_storage', __( 'Your alert could not be saved. Please try again.', 'peptide-collective-commerce' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response( $answer + array( 'status' => 'subscribed' ) );
	}

	/* ---------------------------------------------------------- Stock changes */

	/**
	 * Both hooks fire from the product data store when a saved stock status
	 * actually changed, whatever wrote it. A variation reports under its
	 * parent; a variable parent reports for itself, which also covers children
	 * that inherit stock from it and so never fire their own hook.
	 */
	public static function on_variation_stock_status( $variation_id, $status, $variation = null ): void {
		if ( 'instock' !== $status ) {
			return;
		}
		$parent_id = $variation instanceof WC_Product ? $variation->get_parent_id() : wp_get_post_parent_id( (int) $variation_id );
		self::schedule( (int) $parent_id, (int) $variation_id );
	}

	public static function on_product_stock_status( $product_id, $status, $product = null ): void {
		if ( 'instock' !== $status ) {
			return;
		}
		self::schedule( (int) $product_id, 0 );
	}

	private static function has_pending( int $product_id, int $variation_id ): bool {
		global $wpdb;
		$table = self::table();
		$sql   = $variation_id > 0
			? $wpdb->prepare( "SELECT id FROM {$table} WHERE product_id = %d AND variation_id = %d AND notified_at IS NULL LIMIT 1", $product_id, $variation_id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			: $wpdb->prepare( "SELECT id FROM {$table} WHERE product_id = %d AND notified_at IS NULL LIMIT 1", $product_id ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (bool) $wpdb->get_var( $sql );
	}

	/**
	 * Sending happens off the request that changed the stock. An operator
	 * ticking "in stock" must not wait on a mail server, and a long list must
	 * not time out halfway. Action Scheduler ships with WooCommerce; without
	 * it the send runs inline, which is still correct, only slower.
	 */
	private static function schedule( int $product_id, int $variation_id ): void {
		if ( $product_id < 1 || ! self::has_pending( $product_id, $variation_id ) ) {
			return;
		}
		$args = array( $product_id, $variation_id, 0 );
		if ( function_exists( 'as_enqueue_async_action' ) ) {
			if ( function_exists( 'as_has_scheduled_action' ) && as_has_scheduled_action( self::HOOK_SEND, $args, self::GROUP ) ) {
				return;
			}
			as_enqueue_async_action( self::HOOK_SEND, $args, self::GROUP );
			return;
		}
		self::send( $product_id, $variation_id, 0 );
	}

	/**
	 * One batch of emails for a product, or for one of its variations.
	 *
	 * The cursor moves forward by row id, so a batch that skips rows - a
	 * sibling strength still out of stock, filed under the same product - can
	 * never be handed the same rows again and loop.
	 *
	 * @param int $product_id   Parent product.
	 * @param int $variation_id Variation, or 0 for every alert on the product.
	 * @param int $after_id     Cursor: only rows with a greater id.
	 */
	public static function send( $product_id, $variation_id = 0, $after_id = 0 ): void {
		global $wpdb;

		$product_id   = (int) $product_id;
		$variation_id = (int) $variation_id;
		$after_id     = (int) $after_id;
		$table        = self::table();

		$product = wc_get_product( $product_id );
		if ( ! $product instanceof WC_Product ) {
			return;
		}

		$limit = self::BATCH + 1;
		$sql   = $variation_id > 0
			? $wpdb->prepare( "SELECT id, variation_id, email, created_at FROM {$table} WHERE product_id = %d AND variation_id = %d AND notified_at IS NULL AND id > %d ORDER BY id ASC LIMIT %d", $product_id, $variation_id, $after_id, $limit ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			: $wpdb->prepare( "SELECT id, variation_id, email, created_at FROM {$table} WHERE product_id = %d AND notified_at IS NULL AND id > %d ORDER BY id ASC LIMIT %d", $product_id, $after_id, $limit ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows  = $wpdb->get_results( $sql );
		if ( ! $rows ) {
			return;
		}

		$more = count( $rows ) > self::BATCH;
		if ( $more ) {
			array_pop( $rows );
		}

		$targets = array();
		$last_id = $after_id;
		foreach ( $rows as $row ) {
			$last_id   = (int) $row->id;
			$target_id = (int) $row->variation_id > 0 ? (int) $row->variation_id : $product_id;
			if ( ! array_key_exists( $target_id, $targets ) ) {
				$targets[ $target_id ] = $target_id === $product_id ? $product : wc_get_product( $target_id );
			}
			$target = $targets[ $target_id ];
			// Still waiting: the parent came back but this strength did not.
			if ( ! $target instanceof WC_Product || ! self::is_available( $target ) ) {
				continue;
			}

			$claimed = $wpdb->query(
				$wpdb->prepare( "UPDATE {$table} SET notified_at = %s WHERE id = %d AND notified_at IS NULL", current_time( 'mysql', true ), $row->id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			);
			if ( 1 !== $claimed ) {
				continue;
			}

			if ( ! self::mail( (string) $row->email, $product, $target, (string) $row->created_at ) ) {
				// Handed back, so the next restock tries again rather than losing it.
				$wpdb->update( $table, array( 'notified_at' => null ), array( 'id' => (int) $row->id ), array( '%s' ), array( '%d' ) );
			}
		}

		if ( $more && function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( self::HOOK_SEND, array( $product_id, $variation_id, $last_id ), self::GROUP );
		} elseif ( $more ) {
			self::send( $product_id, $variation_id, $last_id );
		}
	}

	/* ------------------------------------------------------------------ Email */

	/** Strength for a variation ("20 MG"), nothing for a simple product. */
	private static function strength_label( WC_Product $target ): string {
		return $target instanceof WC_Product_Variation ? trim( (string) wc_get_formatted_variation( $target, true, false, false ) ) : '';
	}

	/**
	 * Where the email sends the customer.
	 *
	 * The storefront, when its origin is known, at the strength the alert was
	 * for; otherwise the WordPress product page, which the bridge redirects to
	 * the storefront once it owns traffic.
	 */
	public static function product_url( WC_Product $product, WC_Product $target ): string {
		$url    = $product->get_permalink();
		$origin = self::storefront_origin();
		if ( '' !== $origin ) {
			$key = (string) get_post_meta( $product->get_id(), '_tpc_product_key', true );
			$url = $origin . '/product/' . rawurlencode( '' !== $key ? $key : $product->get_slug() );
			if ( $target->get_id() !== $product->get_id() ) {
				$strength = (string) get_post_meta( $target->get_id(), '_tpc_variation_key', true );
				$url      = add_query_arg( 'strength', '' !== $strength ? $strength : (string) $target->get_id(), $url );
			}
		}
		return (string) apply_filters( 'tpc_stock_alert_product_url', $url, $product, $target );
	}

	private static function storefront_origin(): string {
		foreach ( array( get_option( self::OPTION_ORIGIN ), get_option( 'nvm_bridge_frontend_url' ) ) as $candidate ) {
			$candidate = is_string( $candidate ) ? trim( $candidate ) : '';
			if ( '' === $candidate ) {
				continue;
			}
			$parts = wp_parse_url( $candidate );
			if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) || ! in_array( $parts['scheme'], array( 'http', 'https' ), true ) ) {
				continue;
			}
			return $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' );
		}
		return '';
	}

	/** Sent through WooCommerce's mailer, so it wears the same template as every order email. */
	private static function mail( string $to, WC_Product $product, WC_Product $target, string $requested_at ): bool {
		$mailer = WC()->mailer();
		if ( ! $mailer || ! class_exists( 'WC_Email' ) ) {
			return false;
		}

		$item = trim( $product->get_name() . ' ' . self::strength_label( $target ) );
		$url  = self::product_url( $product, $target );
		/* translators: %s: product name and strength. */
		$subject = sprintf( __( '%s is back in stock', 'peptide-collective-commerce' ), $item );
		$heading = __( 'Back in stock', 'peptide-collective-commerce' );

		$body  = '<p>' . sprintf(
			/* translators: 1: product name and strength, 2: store name. */
			esc_html__( 'Good news: %1$s is available again at %2$s. You asked us to let you know.', 'peptide-collective-commerce' ),
			'<strong>' . esc_html( $item ) . '</strong>',
			esc_html( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) )
		) . '</p>';
		$body .= '<p style="margin:24px 0;"><a href="' . esc_url( $url ) . '" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#0b1420;color:#fafaf7;font-weight:600;text-decoration:none;">' . esc_html__( 'View product', 'peptide-collective-commerce' ) . '</a></p>';
		$body .= '<p style="font-size:12px;color:#596474;">' . sprintf(
			/* translators: %s: the date the alert was requested. */
			esc_html__( 'This is the one email you asked for on %s. We will not send another unless you request a new alert.', 'peptide-collective-commerce' ),
			esc_html( get_date_from_gmt( $requested_at, get_option( 'date_format' ) ) )
		) . '</p>';

		$html  = $mailer->wrap_message( $heading, $body );
		$email = new WC_Email();
		return (bool) $email->send( $to, $subject, $html, "Content-Type: text/html\r\n", array() );
	}

	/* ------------------------------------------------------------------ Admin */

	public static function admin_menu(): void {
		add_submenu_page(
			'woocommerce',
			__( 'Stock alerts', 'peptide-collective-commerce' ),
			__( 'Stock alerts', 'peptide-collective-commerce' ),
			'manage_woocommerce',
			self::ADMIN_PAGE,
			array( self::class, 'render_admin' )
		);
	}

	/** "Product · Strength" for a row, resolving each product once per page. */
	private static function label_for( int $product_id, int $variation_id, array &$cache ): string {
		$key = $product_id . ':' . $variation_id;
		if ( ! isset( $cache[ $key ] ) ) {
			$product = wc_get_product( $product_id );
			$label   = $product instanceof WC_Product ? $product->get_name() : sprintf( '#%d', $product_id );
			if ( $variation_id > 0 ) {
				$variation = wc_get_product( $variation_id );
				$label    .= ' · ' . ( $variation instanceof WC_Product ? self::strength_label( $variation ) : sprintf( '#%d', $variation_id ) );
			}
			$cache[ $key ] = $label;
		}
		return $cache[ $key ];
	}

	public static function render_admin(): void {
		global $wpdb;
		$table = self::table();
		$view  = isset( $_GET['view'] ) && 'sent' === $_GET['view'] ? 'sent' : 'waiting'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$cache = array();

		$waiting_total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE notified_at IS NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$sent_total    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE notified_at IS NOT NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$summary       = $wpdb->get_results( "SELECT product_id, variation_id, COUNT(*) AS waiting FROM {$table} WHERE notified_at IS NULL GROUP BY product_id, variation_id ORDER BY waiting DESC, product_id ASC" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows          = 'sent' === $view
			? $wpdb->get_results( "SELECT product_id, variation_id, email, created_at, notified_at FROM {$table} WHERE notified_at IS NOT NULL ORDER BY notified_at DESC LIMIT 200" ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			: $wpdb->get_results( "SELECT product_id, variation_id, email, created_at, notified_at FROM {$table} WHERE notified_at IS NULL ORDER BY created_at DESC LIMIT 200" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$base   = admin_url( 'admin.php?page=' . self::ADMIN_PAGE );
		$format = get_option( 'date_format' ) . ' ' . get_option( 'time_format' );
		$when   = static function ( $gmt ) use ( $format ) {
			return $gmt ? esc_html( get_date_from_gmt( (string) $gmt, $format ) ) : '&mdash;';
		};

		echo '<div class="wrap"><h1>' . esc_html__( 'Stock alerts', 'peptide-collective-commerce' ) . '</h1>';
		echo '<p>' . esc_html__( 'Customers who asked to be emailed when a strength is back in stock. Each request is emailed once, when WooCommerce marks that strength in stock.', 'peptide-collective-commerce' ) . '</p>';

		echo '<h2>' . esc_html__( 'Waiting by product', 'peptide-collective-commerce' ) . '</h2>';
		if ( $summary ) {
			echo '<table class="widefat striped" style="max-width:640px"><thead><tr><th>' . esc_html__( 'Product', 'peptide-collective-commerce' ) . '</th><th style="text-align:right">' . esc_html__( 'Waiting', 'peptide-collective-commerce' ) . '</th></tr></thead><tbody>';
			foreach ( $summary as $line ) {
				echo '<tr><td>' . esc_html( self::label_for( (int) $line->product_id, (int) $line->variation_id, $cache ) ) . '</td><td style="text-align:right">' . (int) $line->waiting . '</td></tr>';
			}
			echo '</tbody></table>';
		} else {
			echo '<p>' . esc_html__( 'Nobody is waiting on a restock right now.', 'peptide-collective-commerce' ) . '</p>';
		}

		echo '<ul class="subsubsub" style="clear:both;margin-top:24px">';
		echo '<li><a href="' . esc_url( $base ) . '"' . ( 'waiting' === $view ? ' class="current"' : '' ) . '>' . esc_html__( 'Waiting', 'peptide-collective-commerce' ) . ' <span class="count">(' . $waiting_total . ')</span></a> | </li>';
		echo '<li><a href="' . esc_url( add_query_arg( 'view', 'sent', $base ) ) . '"' . ( 'sent' === $view ? ' class="current"' : '' ) . '>' . esc_html__( 'Sent', 'peptide-collective-commerce' ) . ' <span class="count">(' . $sent_total . ')</span></a></li>';
		echo '</ul>';

		echo '<table class="widefat striped" style="clear:both"><thead><tr><th>' . esc_html__( 'Email', 'peptide-collective-commerce' ) . '</th><th>' . esc_html__( 'Product', 'peptide-collective-commerce' ) . '</th><th>' . esc_html__( 'Requested', 'peptide-collective-commerce' ) . '</th><th>' . esc_html__( 'Sent', 'peptide-collective-commerce' ) . '</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $row ) {
				echo '<tr><td>' . esc_html( $row->email ) . '</td><td>' . esc_html( self::label_for( (int) $row->product_id, (int) $row->variation_id, $cache ) ) . '</td><td>' . $when( $row->created_at ) . '</td><td>' . $when( $row->notified_at ) . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			}
		} else {
			echo '<tr><td colspan="4">' . esc_html__( 'Nothing here yet.', 'peptide-collective-commerce' ) . '</td></tr>';
		}
		echo '</tbody></table>';
		if ( count( $rows ) >= 200 ) {
			echo '<p class="description">' . esc_html__( 'Showing the most recent 200.', 'peptide-collective-commerce' ) . '</p>';
		}
		echo '</div>';
	}
}
