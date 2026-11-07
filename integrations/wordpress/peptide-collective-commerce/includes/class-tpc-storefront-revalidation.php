<?php
/**
 * Storefront revalidation: tell the storefront a product changed.
 *
 * The storefront caches its catalogue for an hour and prerenders the shop and
 * product pages on the same clock. Without a nudge from here, a stock change
 * or a new certificate shows up whenever that hour happens to end. This module
 * is the nudge: one signed POST per changed product to
 * `{tpc_storefront_url}/api/webhooks/woocommerce`, carrying the storefront key
 * so the handler can expire exactly `product:<key>` and `public:catalog`.
 *
 * Nothing is sent from the request that made the change. A product save fires
 * half a dozen hooks and an order deducts stock for every line, so each event
 * is collapsed to one Action Scheduler job per product key inside a ten second
 * window, and that job runs after the editor's request has finished. A
 * delivery that fails is retried once, thirty seconds later, and its outcome
 * is kept on the admin screen. The secret is never logged.
 *
 * Certificate uploads have no WooCommerce hook of their own, so TPC_COA_Watcher
 * feeds them into this same queue by watching the certificate plugin's own ajax
 * actions. `wp tpc-commerce refresh` and the admin button remain for a manual
 * or bulk push.
 *
 * Since 1.4.0 the same queue carries a second topic. TPC_Lab_Reports hands a
 * saved, trashed or restored lab report to `queue_report()`, which travels as
 * `tpc.report` with `{"id":..,"key":..|null}` so the storefront can expire
 * `public:reports` as well - something an ordinary stock change must not do.
 * Everything else about the delivery is shared, and a `tpc.product` delivery is
 * unchanged down to the bytes.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Storefront_Revalidation {

	const OPTION_URL    = 'tpc_storefront_url';
	const OPTION_SECRET = 'tpc_storefront_webhook_secret';
	const OPTION_LAST   = 'tpc_storefront_revalidation_last';
	const HOOK_SEND     = 'tpc_storefront_revalidate';
	const GROUP         = 'peptide-collective-commerce';
	const TOPIC         = 'tpc.product';
	const TOPIC_REPORT  = 'tpc.report';
	const PATH          = '/api/webhooks/woocommerce';
	const TIMEOUT       = 5;
	const DEDUPE        = 10;
	const RETRY_DELAY   = 30;
	const ADMIN_PAGE    = 'tpc-storefront-sync';
	const ACTION_SAVE   = 'tpc_storefront_sync_save';
	const ACTION_TEST   = 'tpc_storefront_sync_test';
	const ACTION_ALL    = 'tpc_storefront_sync_all';
	const REASONS       = array( 'stock', 'price', 'certificate', 'save' );

	/** @var array<int, array> Jobs to run on shutdown when Action Scheduler is absent. */
	private static $inline = array();

	public static function boot(): void {
		// Saves, from any editor, import or REST client. A variation reports
		// under its parent, since the storefront keys on the parent.
		foreach ( array(
			'woocommerce_update_product',
			'woocommerce_new_product',
			'woocommerce_update_product_variation',
			'woocommerce_new_product_variation',
		) as $event ) {
			add_action( $event, array( self::class, 'on_save' ), 10, 1 );
		}

		// Stock levels arrive with the object; stock status with the id.
		add_action( 'woocommerce_product_set_stock', array( self::class, 'on_stock_object' ), 10, 1 );
		add_action( 'woocommerce_variation_set_stock', array( self::class, 'on_stock_object' ), 10, 1 );
		add_action( 'woocommerce_product_set_stock_status', array( self::class, 'on_stock_id' ), 10, 1 );
		add_action( 'woocommerce_variation_set_stock_status', array( self::class, 'on_stock_id' ), 10, 1 );

		// The one moment the changed props are still listed, so a price edit
		// can say "price" rather than "save".
		add_action( 'woocommerce_product_object_updated_props', array( self::class, 'on_updated_props' ), 10, 2 );

		add_action( 'wp_trash_post', array( self::class, 'on_trash' ), 10, 1 );
		add_action( 'untrashed_post', array( self::class, 'on_trash' ), 10, 1 );

		add_action( self::HOOK_SEND, array( self::class, 'deliver' ), 10, 6 );

		add_action( 'admin_menu', array( self::class, 'admin_menu' ), 61 );
		add_action( 'admin_post_' . self::ACTION_SAVE, array( self::class, 'handle_save' ) );
		add_action( 'admin_post_' . self::ACTION_TEST, array( self::class, 'handle_test' ) );
		add_action( 'admin_post_' . self::ACTION_ALL, array( self::class, 'handle_all' ) );
	}

	/* ---------------------------------------------------------------- Events */

	/** @param int|string $product_id */
	public static function on_save( $product_id ): void {
		self::queue( (int) $product_id, 'save' );
	}

	/** @param mixed $product A WC_Product. */
	public static function on_stock_object( $product ): void {
		if ( $product instanceof WC_Product ) {
			self::queue( $product->get_id(), 'stock' );
		}
	}

	/** @param int|string $product_id */
	public static function on_stock_id( $product_id ): void {
		self::queue( (int) $product_id, 'stock' );
	}

	/**
	 * @param mixed $product       A WC_Product about to be saved.
	 * @param mixed $updated_props Prop names the data store just wrote.
	 */
	public static function on_updated_props( $product, $updated_props ): void {
		if ( ! $product instanceof WC_Product || ! is_array( $updated_props ) ) {
			return;
		}
		$price_props = array( 'price', 'regular_price', 'sale_price', 'date_on_sale_from', 'date_on_sale_to' );
		if ( array_intersect( $price_props, $updated_props ) ) {
			self::queue( $product->get_id(), 'price' );
		}
	}

	/** @param int|string $post_id */
	public static function on_trash( $post_id ): void {
		if ( 'product' === get_post_type( (int) $post_id ) ) {
			self::queue( (int) $post_id, 'save' );
		}
	}

	/* ----------------------------------------------------------------- Queue */

	/**
	 * Resolve the parent, collapse to one job per key per ten seconds, and
	 * hand the send to Action Scheduler.
	 *
	 * The dedupe window is a transient keyed on the storefront key. The first
	 * reason inside the window is the one delivered; a stock change followed
	 * by a save within ten seconds still reaches the storefront once, which
	 * expires the same cache tags either way.
	 */
	public static function queue( int $product_id, string $reason ): void {
		if ( $product_id < 1 || '' === self::config()['url'] || ! function_exists( 'wc_get_product' ) ) {
			return;
		}

		$product = wc_get_product( $product_id );
		if ( ! $product instanceof WC_Product ) {
			return;
		}
		if ( $product->is_type( 'variation' ) ) {
			$product = wc_get_product( $product->get_parent_id() );
			if ( ! $product instanceof WC_Product ) {
				return;
			}
		}

		$key = TPC_Product_Contract::key_for( $product );
		if ( '' === $key ) {
			return;
		}

		$dedupe = 'tpc_reval_' . md5( $key );
		if ( false !== get_transient( $dedupe ) ) {
			return;
		}
		set_transient( $dedupe, $reason, self::DEDUPE );

		self::enqueue( $key, $product->get_id(), $reason );
	}

	/**
	 * Queue one `tpc.report` delivery for a lab report post.
	 *
	 * Everything below the topic is shared with products: the same async job,
	 * the same signing, the same ten second window, the same single retry. Only
	 * the dedupe key differs, because a report is collapsed per post and a
	 * product per storefront key - two reports for the same product inside ten
	 * seconds are two different facts and both have to travel.
	 *
	 * @param int         $post_id The lab-report post.
	 * @param string|null $key     Storefront key the report resolves to, or null.
	 */
	public static function queue_report( int $post_id, ?string $key ): void {
		if ( $post_id < 1 || '' === self::config()['url'] ) {
			return;
		}

		$dedupe = 'tpc_reval_report_' . $post_id;
		if ( false !== get_transient( $dedupe ) ) {
			return;
		}
		set_transient( $dedupe, '1', self::DEDUPE );

		self::enqueue( null === $key ? '' : $key, $post_id, 'save', self::TOPIC_REPORT );
	}

	/**
	 * One async job. Without Action Scheduler the send runs on shutdown, after the response.
	 *
	 * The topic is appended to the job arguments only when it is not the
	 * product one, so a product's job is the same five arguments it has always
	 * been - which matters because Action Scheduler identifies a pending job by
	 * hashing them, and because jobs queued by the previous version are still
	 * in the table when this one activates.
	 */
	private static function enqueue( string $key, int $product_id, string $reason, string $topic = self::TOPIC ): void {
		$args = array( $key, $product_id, $reason, 0, self::delivery_id() );
		if ( self::TOPIC !== $topic ) {
			$args[] = $topic;
		}

		if ( function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( self::HOOK_SEND, $args, self::GROUP );
			return;
		}

		if ( ! self::$inline ) {
			add_action( 'shutdown', array( self::class, 'flush_inline' ), 20 );
		}
		self::$inline[] = $args;
	}

	public static function flush_inline(): void {
		$jobs         = self::$inline;
		self::$inline = array();
		foreach ( $jobs as $args ) {
			self::deliver( ...$args );
		}
	}

	/** Unique per queued delivery and reused by its retry, so the storefront can drop a duplicate. */
	private static function delivery_id(): string {
		return 'tpc-' . bin2hex( random_bytes( 12 ) );
	}

	/* -------------------------------------------------------------- Delivery */

	/**
	 * The Action Scheduler job. Sends once; on failure schedules one retry.
	 *
	 * @param string $key
	 * @param int    $product_id
	 * @param string $reason
	 * @param int    $attempt     0 for the first send, 1 for the retry.
	 * @param string $delivery_id Stable across the retry.
	 * @param string $topic       `tpc.product` unless a job said otherwise; a job
	 *                            queued before this argument existed omits it.
	 */
	public static function deliver( $key, $product_id = 0, $reason = 'save', $attempt = 0, $delivery_id = '', $topic = self::TOPIC ): void {
		$key         = (string) $key;
		$product_id  = (int) $product_id;
		$reason      = in_array( (string) $reason, self::REASONS, true ) ? (string) $reason : 'save';
		$attempt     = (int) $attempt;
		$delivery_id = '' !== (string) $delivery_id ? (string) $delivery_id : self::delivery_id();
		$topic       = in_array( (string) $topic, array( self::TOPIC, self::TOPIC_REPORT ), true ) ? (string) $topic : self::TOPIC;

		$result = self::send( $key, $product_id, $reason, $delivery_id, $topic );
		self::record( $result );

		if ( $result['ok'] || ! empty( $result['skipped'] ) || $attempt >= 1 ) {
			return;
		}

		if ( function_exists( 'as_schedule_single_action' ) ) {
			$args = array( $key, $product_id, $reason, 1, $delivery_id );
			if ( self::TOPIC !== $topic ) {
				$args[] = $topic;
			}
			as_schedule_single_action(
				time() + self::RETRY_DELAY,
				self::HOOK_SEND,
				$args,
				self::GROUP
			);
		}
	}

	/**
	 * One signed POST.
	 *
	 * The signature is what WooCommerce's own webhooks send: base64 of an
	 * HMAC-SHA256 over the raw body, so the storefront verifies both with the
	 * same code. The topic header is how it tells this payload from a native
	 * `product.updated` one.
	 *
	 * Two topics travel this way. `tpc.product` carries the reason a product
	 * changed; `tpc.report` carries a lab report and the product it resolves
	 * to, which may be null, and no reason, because there is only one. Contract
	 * 9.4. A product delivery is byte for byte what it was before reports
	 * existed: same body keys in the same order, same headers.
	 *
	 * @return array{ok:bool, status:int, error:string, key:string, reason:string, at:string, topic:string, skipped?:string}
	 */
	public static function send( string $key, int $product_id, string $reason, string $delivery_id = '', string $topic = self::TOPIC ): array {
		$topic   = in_array( $topic, array( self::TOPIC, self::TOPIC_REPORT ), true ) ? $topic : self::TOPIC;
		$report  = self::TOPIC_REPORT === $topic;
		$config  = self::config();
		$summary = array(
			'ok'     => false,
			'status' => 0,
			'error'  => '',
			'key'    => $key,
			'reason' => $reason,
			'at'     => gmdate( 'c' ),
			'topic'  => $topic,
		);

		if ( '' === $config['url'] ) {
			$summary['skipped'] = 'no_url';
			return $summary;
		}
		if ( '' === $config['secret'] ) {
			// An unsigned delivery is refused with 401 by the storefront, so
			// sending it would only burn a retry. Say why instead.
			$summary['skipped'] = 'no_secret';
			$summary['error']   = 'No webhook secret is set.';
			return $summary;
		}

		$payload = $report
			? array(
				'id'  => $product_id,
				'key' => '' !== $key ? $key : null,
			)
			: array(
				'id'     => $product_id,
				'key'    => $key,
				'reason' => $reason,
			);

		$body        = (string) wp_json_encode( $payload );
		$signature   = base64_encode( hash_hmac( 'sha256', $body, $config['secret'], true ) );
		$delivery_id = '' !== $delivery_id ? $delivery_id : self::delivery_id();

		$response = wp_remote_post(
			$config['url'] . self::PATH,
			array(
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'blocking'    => true,
				'headers'     => array(
					'Content-Type'             => 'application/json',
					'Accept'                   => 'application/json',
					'User-Agent'               => 'PeptideCollectiveCommerce/' . TPC_Bundle_Save::VERSION . ' (+' . home_url( '/' ) . ')',
					'X-WC-Webhook-Source'      => home_url( '/' ),
					'X-WC-Webhook-Topic'       => $topic,
					'X-WC-Webhook-Resource'    => $report ? 'lab_report' : 'product',
					'X-WC-Webhook-Event'       => 'tpc',
					'X-WC-Webhook-Signature'   => $signature,
					'X-WC-Webhook-ID'          => $delivery_id,
					'X-WC-Webhook-Delivery-ID' => $delivery_id,
				),
				'body'        => $body,
			)
		);

		// An unmatched report has no key, so the log says which post it was.
		$label = '' !== $key ? $key : $topic . ' #' . $product_id;

		if ( is_wp_error( $response ) ) {
			$summary['error'] = (string) $response->get_error_message();
			self::log( 'delivery for ' . $label . ' failed: ' . $summary['error'] );
			return $summary;
		}

		$status            = (int) wp_remote_retrieve_response_code( $response );
		$summary['status'] = $status;

		if ( $status >= 200 && $status < 300 ) {
			$summary['ok'] = true;
			return $summary;
		}

		$summary['error'] = self::explain( $status );
		self::log( 'storefront answered HTTP ' . $status . ' for ' . $label . ': ' . $summary['error'] );

		return $summary;
	}

	private static function explain( int $status ): string {
		switch ( $status ) {
			case 401:
				return 'The secret does not match WOOCOMMERCE_WEBHOOK_SECRET on the storefront.';
			case 404:
				return 'The storefront has no /api/webhooks/woocommerce route at this URL.';
			case 413:
				return 'The storefront refused the payload size.';
			default:
				return 'Unexpected status from the storefront.';
		}
	}

	private static function log( string $message ): void {
		error_log( '[peptide-collective-commerce] ' . $message ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
	}

	/** @param array<string, mixed> $summary */
	private static function record( array $summary ): void {
		update_option( self::OPTION_LAST, $summary, false );
	}

	/* --------------------------------------------------------- Configuration */

	/**
	 * Endpoint origin and secret. A constant in wp-config.php beats the
	 * option, so a staging copy of the database cannot post to production.
	 *
	 * @return array{url:string, secret:string, url_from_constant:bool, secret_from_constant:bool}
	 */
	public static function config(): array {
		$url_from_constant    = defined( 'TPC_STOREFRONT_URL' );
		$secret_from_constant = defined( 'TPC_STOREFRONT_WEBHOOK_SECRET' );

		$url    = $url_from_constant ? (string) constant( 'TPC_STOREFRONT_URL' ) : (string) get_option( self::OPTION_URL, '' );
		$secret = $secret_from_constant ? (string) constant( 'TPC_STOREFRONT_WEBHOOK_SECRET' ) : (string) get_option( self::OPTION_SECRET, '' );

		/*
		 * With nothing set here, follow NVM Headless Core's storefront origin.
		 *
		 * Two settings naming the same storefront is two settings that can
		 * disagree, and the failure is silent: the core keeps handing customers
		 * to the right origin while product edits go on notifying the old one.
		 * The core's value is the one that already has to be correct, because
		 * the checkout handoff validates against it, so it is the better
		 * default. This option stays as an override for the rare case where
		 * webhooks belong somewhere else.
		 */
		$from_core = false;
		if ( '' === trim( $url ) ) {
			$url       = self::core_frontend_url();
			$from_core = '' !== $url;
		}

		return array(
			'url'                  => self::origin( $url ),
			'secret'               => trim( $secret ),
			'url_from_constant'    => $url_from_constant,
			'url_from_core'        => $from_core,
			'secret_from_constant' => $secret_from_constant,
		);
	}

	/** The storefront origin NVM Headless Core is configured with, or ''. */
	public static function core_frontend_url(): string {
		if ( class_exists( 'NVM_Headless_Bridge' ) && method_exists( 'NVM_Headless_Bridge', 'frontend_url' ) ) {
			$url = (string) NVM_Headless_Bridge::frontend_url();
			if ( '' !== trim( $url ) ) {
				return $url;
			}
		}

		return (string) get_option( 'nvm_bridge_frontend_url', '' );
	}

	/** scheme://host[:port] or '', so a pasted page URL still posts to the right route. */
	public static function origin( string $url ): string {
		$url = trim( $url );
		if ( '' === $url ) {
			return '';
		}
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) || ! in_array( $parts['scheme'], array( 'http', 'https' ), true ) ) {
			return '';
		}
		return $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' );
	}

	/** Every product the storefront lists, as ids. */
	public static function catalogue_ids(): array {
		if ( ! function_exists( 'wc_get_products' ) ) {
			return array();
		}
		$ids = wc_get_products(
			array(
				'status' => 'publish',
				'type'   => array( 'simple', 'variable' ),
				'limit'  => -1,
				'return' => 'ids',
			)
		);
		return array_map( 'intval', is_array( $ids ) ? $ids : array() );
	}

	/* ------------------------------------------------------------------ Admin */

	public static function admin_menu(): void {
		add_submenu_page(
			'woocommerce',
			__( 'Storefront sync', 'peptide-collective-commerce' ),
			__( 'Storefront sync', 'peptide-collective-commerce' ),
			'manage_woocommerce',
			self::ADMIN_PAGE,
			array( self::class, 'render_admin' )
		);
	}

	private static function guard( string $action ): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You cannot change the storefront sync settings.', 'peptide-collective-commerce' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function back( string $notice ): void {
		wp_safe_redirect( add_query_arg( 'tpc', $notice, admin_url( 'admin.php?page=' . self::ADMIN_PAGE ) ) );
		exit;
	}

	public static function handle_save(): void {
		self::guard( self::ACTION_SAVE );

		if ( ! defined( 'TPC_STOREFRONT_URL' ) ) {
			$raw = trim( (string) wp_unslash( $_POST['url'] ?? '' ) );
			if ( '' !== $raw && '' === self::origin( $raw ) ) {
				self::back( 'bad_url' );
			}
			update_option( self::OPTION_URL, self::origin( $raw ), false );
		}

		if ( ! defined( 'TPC_STOREFRONT_WEBHOOK_SECRET' ) ) {
			if ( ! empty( $_POST['clear_secret'] ) ) {
				delete_option( self::OPTION_SECRET );
			} else {
				// Blank keeps the stored value: the field never echoes it back.
				$secret = trim( (string) wp_unslash( $_POST['secret'] ?? '' ) );
				if ( '' !== $secret ) {
					update_option( self::OPTION_SECRET, $secret, false );
				}
			}
		}

		self::back( 'saved' );
	}

	/** One synchronous delivery for the first catalogue product, so the outcome is on screen at once. */
	public static function handle_test(): void {
		self::guard( self::ACTION_TEST );

		$ids = self::catalogue_ids();
		if ( ! $ids ) {
			self::back( 'no_products' );
		}
		$product = wc_get_product( $ids[0] );
		if ( ! $product instanceof WC_Product ) {
			self::back( 'no_products' );
		}

		$result = self::send( TPC_Product_Contract::key_for( $product ), $product->get_id(), 'save' );
		self::record( $result );

		if ( ! empty( $result['skipped'] ) ) {
			self::back( 'unconfigured' );
		}
		self::back( $result['ok'] ? 'test_ok' : 'test_failed' );
	}

	/** Queue every product, bypassing the dedupe window. */
	public static function handle_all(): void {
		self::guard( self::ACTION_ALL );

		$count = 0;
		foreach ( self::catalogue_ids() as $id ) {
			$product = wc_get_product( $id );
			if ( ! $product instanceof WC_Product ) {
				continue;
			}
			self::enqueue( TPC_Product_Contract::key_for( $product ), $id, 'certificate' );
			++$count;
		}

		self::back( 'queued_' . $count );
	}

	public static function render_admin(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		$config = self::config();
		$last   = get_option( self::OPTION_LAST, array() );
		$last   = is_array( $last ) ? $last : array();
		$notice = isset( $_GET['tpc'] ) ? sanitize_key( wp_unslash( $_GET['tpc'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$ready  = '' !== $config['url'] && '' !== $config['secret'];
		$post   = esc_url( admin_url( 'admin-post.php' ) );

		echo '<div class="wrap"><h1>' . esc_html__( 'Storefront sync', 'peptide-collective-commerce' ) . '</h1>';

		$messages = array(
			'saved'        => array( 'success', __( 'Saved.', 'peptide-collective-commerce' ) ),
			'bad_url'      => array( 'error', __( 'The storefront URL must be a complete http or https origin.', 'peptide-collective-commerce' ) ),
			'test_ok'      => array( 'success', __( 'The storefront accepted the webhook.', 'peptide-collective-commerce' ) ),
			'test_failed'  => array( 'error', __( 'The webhook did not get through. The last result below says why.', 'peptide-collective-commerce' ) ),
			'unconfigured' => array( 'warning', __( 'Set the storefront URL and the secret first.', 'peptide-collective-commerce' ) ),
			'no_products'  => array( 'warning', __( 'There are no published products to send.', 'peptide-collective-commerce' ) ),
		);
		if ( isset( $messages[ $notice ] ) ) {
			echo '<div class="notice notice-' . esc_attr( $messages[ $notice ][0] ) . ' is-dismissible"><p>' . esc_html( $messages[ $notice ][1] ) . '</p></div>';
		} elseif ( 0 === strpos( $notice, 'queued_' ) ) {
			/* translators: %d: number of products queued. */
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sprintf( __( 'Queued %d products. Deliveries run in the background; the last result updates as they complete.', 'peptide-collective-commerce' ), (int) substr( $notice, 7 ) ) ) . '</p></div>';
		}

		echo '<p style="max-width:70ch">' . esc_html__( 'When a product, its stock or its price changes, WordPress tells the storefront and the change is live within seconds. Certificate uploads are not hooked, so refresh after uploading one.', 'peptide-collective-commerce' ) . '</p>';
		echo '<p style="padding:12px 16px;border-left:4px solid ' . ( $ready ? '#2f8659' : '#b4423a' ) . ';background:#fff;max-width:70ch"><strong>' . ( $ready ? esc_html__( 'Sync is on.', 'peptide-collective-commerce' ) : esc_html__( 'Sync is off.', 'peptide-collective-commerce' ) ) . '</strong><br>';
		echo $ready
			? esc_html__( 'Product changes are sent to', 'peptide-collective-commerce' ) . ' <code>' . esc_html( $config['url'] . self::PATH ) . '</code>'
			: esc_html__( 'Nothing is sent until both the storefront URL and the secret are set.', 'peptide-collective-commerce' );
		echo '</p>';

		echo '<form method="post" action="' . $post . '"><input type="hidden" name="action" value="' . esc_attr( self::ACTION_SAVE ) . '">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		wp_nonce_field( self::ACTION_SAVE );
		echo '<table class="form-table" role="presentation"><tr><th scope="row"><label for="tpc-storefront-url">' . esc_html__( 'Storefront URL', 'peptide-collective-commerce' ) . '</label></th><td>';
		echo '<input type="url" id="tpc-storefront-url" name="url" class="regular-text code" value="' . esc_attr( $config['url'] ) . '" placeholder="https://www.peptidescollective.com"' . disabled( $config['url_from_constant'], true, false ) . '>';
		$hint = $config['url_from_constant']
			? esc_html__( 'Set by TPC_STOREFRONT_URL in wp-config.php.', 'peptide-collective-commerce' )
			: ( $config['url_from_core']
				? sprintf(
					/* translators: %s: the storefront origin inherited from NVM Headless Core. */
					esc_html__( 'Leave empty to follow NVM Headless Core, which is currently %s.', 'peptide-collective-commerce' ),
					'<code>' . esc_html( $config['url'] ) . '</code>'
				)
				: esc_html__( 'Leave empty to follow the storefront origin set in WooCommerce -> Headless Core. Restock emails link here too.', 'peptide-collective-commerce' ) );
		echo '<p class="description">' . wp_kses( $hint, array( 'code' => array() ) ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="tpc-storefront-secret">' . esc_html__( 'Webhook secret', 'peptide-collective-commerce' ) . '</label></th><td>';
		echo '<input type="password" id="tpc-storefront-secret" name="secret" class="regular-text code" value="" autocomplete="new-password" placeholder="' . ( '' !== $config['secret'] ? esc_attr__( '(set - leave blank to keep)', 'peptide-collective-commerce' ) : '' ) . '"' . disabled( $config['secret_from_constant'], true, false ) . '>';
		echo '<p class="description">' . ( $config['secret_from_constant'] ? esc_html__( 'Set by TPC_STOREFRONT_WEBHOOK_SECRET in wp-config.php.', 'peptide-collective-commerce' ) : esc_html__( 'The same value as WOOCOMMERCE_WEBHOOK_SECRET on the storefront. It is never shown again.', 'peptide-collective-commerce' ) ) . '</p>';
		if ( ! $config['secret_from_constant'] && '' !== $config['secret'] ) {
			echo '<label><input type="checkbox" name="clear_secret" value="1"> ' . esc_html__( 'Clear the stored secret', 'peptide-collective-commerce' ) . '</label>';
		}
		echo '</td></tr></table>';
		submit_button( __( 'Save', 'peptide-collective-commerce' ) );
		echo '</form>';

		echo '<form method="post" action="' . $post . '" style="display:inline-block;margin-right:12px"><input type="hidden" name="action" value="' . esc_attr( self::ACTION_TEST ) . '">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		wp_nonce_field( self::ACTION_TEST );
		submit_button( __( 'Send a test webhook', 'peptide-collective-commerce' ), 'secondary', 'submit', false, $ready ? array() : array( 'disabled' => 'disabled' ) );
		echo '</form>';
		echo '<form method="post" action="' . $post . '" style="display:inline-block"><input type="hidden" name="action" value="' . esc_attr( self::ACTION_ALL ) . '">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		wp_nonce_field( self::ACTION_ALL );
		submit_button( __( 'Refresh every product', 'peptide-collective-commerce' ), 'secondary', 'submit', false, $ready ? array() : array( 'disabled' => 'disabled' ) );
		echo '</form>';
		echo '<p class="description">' . esc_html__( 'The test sends one product now and reports the answer. Refresh queues every published product; use it after uploading certificates.', 'peptide-collective-commerce' ) . '</p>';

		echo '<h2>' . esc_html__( 'Last result', 'peptide-collective-commerce' ) . '</h2>';
		if ( ! $last ) {
			echo '<p>' . esc_html__( 'Nothing has been sent yet.', 'peptide-collective-commerce' ) . '</p></div>';
			return;
		}
		echo '<table class="widefat striped" style="max-width:70ch"><tbody>';
		echo '<tr><th>' . esc_html__( 'When', 'peptide-collective-commerce' ) . '</th><td>' . esc_html( (string) ( $last['at'] ?? '' ) ) . ' (UTC)</td></tr>';
		// Products and lab reports share this row, so it has to say which.
		echo '<tr><th>' . esc_html__( 'Topic', 'peptide-collective-commerce' ) . '</th><td><code>' . esc_html( (string) ( $last['topic'] ?? self::TOPIC ) ) . '</code></td></tr>';
		echo '<tr><th>' . esc_html__( 'Product key', 'peptide-collective-commerce' ) . '</th><td><code>' . esc_html( '' !== (string) ( $last['key'] ?? '' ) ? (string) $last['key'] : '-' ) . '</code></td></tr>';
		echo '<tr><th>' . esc_html__( 'Reason', 'peptide-collective-commerce' ) . '</th><td><code>' . esc_html( (string) ( $last['reason'] ?? '' ) ) . '</code></td></tr>';
		echo '<tr><th>' . esc_html__( 'Outcome', 'peptide-collective-commerce' ) . '</th><td>';
		if ( ! empty( $last['ok'] ) ) {
			echo '<strong style="color:#2f8659">' . esc_html__( 'Accepted', 'peptide-collective-commerce' ) . '</strong> (HTTP ' . (int) ( $last['status'] ?? 0 ) . ')';
		} elseif ( ! empty( $last['skipped'] ) ) {
			echo '<strong style="color:#b4423a">' . esc_html__( 'Skipped', 'peptide-collective-commerce' ) . '</strong> <code>' . esc_html( (string) $last['skipped'] ) . '</code>';
		} else {
			echo '<strong style="color:#b4423a">' . esc_html__( 'Failed', 'peptide-collective-commerce' ) . '</strong>' . ( ! empty( $last['status'] ) ? ' (HTTP ' . (int) $last['status'] . ')' : '' ) . '<br>' . esc_html( (string) ( $last['error'] ?? '' ) );
		}
		echo '</td></tr></tbody></table></div>';
	}
}

/* ---------------------------------------------------------------- WP-CLI */

if ( defined( 'WP_CLI' ) && WP_CLI && class_exists( 'WP_CLI' ) ) {
	/**
	 * Tell the storefront the catalogue changed.
	 */
	final class TPC_Commerce_CLI {

		/**
		 * Send the signed tpc.product webhook now, for one product or for every published product.
		 *
		 * ## OPTIONS
		 *
		 * [--key=<key>]
		 * : Storefront key or WordPress slug of one product. Omit to send every published product.
		 *
		 * [--reason=<reason>]
		 * : One of stock, price, certificate, save. Defaults to certificate, the change that has no hook of its own.
		 *
		 * ## EXAMPLES
		 *
		 *     wp tpc-commerce refresh
		 *     wp tpc-commerce refresh --key=glp-3-r
		 */
		public function refresh( $args, $assoc_args ): void {
			$reason = (string) ( $assoc_args['reason'] ?? 'certificate' );
			if ( ! in_array( $reason, TPC_Storefront_Revalidation::REASONS, true ) ) {
				WP_CLI::error( 'reason must be one of ' . implode( ', ', TPC_Storefront_Revalidation::REASONS ) . '.' );
			}

			$config = TPC_Storefront_Revalidation::config();
			if ( '' === $config['url'] ) {
				WP_CLI::error( 'No storefront origin. Set one in WooCommerce -> Headless Core, or in this plugin\x27s settings. Nothing sent.' );
			}
			if ( '' === $config['secret'] ) {
				WP_CLI::error( 'tpc_storefront_webhook_secret is empty. Nothing sent.' );
			}

			$key = isset( $assoc_args['key'] ) ? (string) $assoc_args['key'] : '';
			if ( '' !== $key ) {
				$id = TPC_Product_Contract::product_id_for_key( $key );
				if ( $id < 1 ) {
					WP_CLI::error( 'No product answers to key ' . $key . '.' );
				}
				$ids = array( $id );
			} else {
				$ids = TPC_Storefront_Revalidation::catalogue_ids();
				if ( ! $ids ) {
					WP_CLI::error( 'No published products.' );
				}
			}

			$sent   = 0;
			$failed = 0;
			foreach ( $ids as $id ) {
				$product = wc_get_product( $id );
				if ( ! $product instanceof WC_Product ) {
					continue;
				}
				$product_key = TPC_Product_Contract::key_for( $product );
				$result      = TPC_Storefront_Revalidation::send( $product_key, $id, $reason );
				if ( $result['ok'] ) {
					++$sent;
					WP_CLI::log( sprintf( 'ok    %-32s #%d HTTP %d', $product_key, $id, $result['status'] ) );
				} else {
					++$failed;
					WP_CLI::warning( sprintf( '%-32s #%d %s', $product_key, $id, '' !== $result['error'] ? $result['error'] : 'HTTP ' . $result['status'] ) );
				}
			}

			if ( $failed > 0 ) {
				WP_CLI::error( sprintf( '%d sent, %d failed.', $sent, $failed ) );
			}
			WP_CLI::success( sprintf( '%d sent to %s%s.', $sent, $config['url'], TPC_Storefront_Revalidation::PATH ) );
		}

		/**
		 * Send the signed tpc.report webhook now, for one lab report or for every published one.
		 *
		 * A report edit already sends itself. This is for a bulk push after an
		 * import, and for the first push after the storefront starts reading
		 * reports from WordPress at all.
		 *
		 * ## OPTIONS
		 *
		 * [--id=<id>]
		 * : Post id of one lab report. Omit to send every published report.
		 *
		 * ## EXAMPLES
		 *
		 *     wp tpc-commerce reports
		 *     wp tpc-commerce reports --id=15080
		 */
		public function reports( $args, $assoc_args ): void {
			if ( ! class_exists( 'TPC_Lab_Reports' ) ) {
				WP_CLI::error( 'The lab reports module is not loaded.' );
			}

			TPC_Lab_Reports::cli_reports( is_array( $assoc_args ) ? $assoc_args : array() );
		}
	}

	WP_CLI::add_command( 'tpc-commerce', 'TPC_Commerce_CLI' );
}
