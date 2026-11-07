<?php
/**
 * The only customer redirect policy on WordPress.
 *
 * Native checkout, payment handling and order receipts stay on WordPress.
 * Every other customer page belongs to the configured headless storefront.
 */

defined( 'ABSPATH' ) || exit;

final class NVM_Storefront_Router {
	const OPT_RETURN_LINK     = 'nvm_bridge_return_link';
	/* The one-time sign-in return: on unless this option is 'no'. */
	const OPT_SIGNED_IN_RETURN = 'nvm_bridge_signed_in_return';
	const RETURNED_COOKIE      = 'nvm_sf_returned';

	/* Query parameters an affiliate or campaign link may carry. Only the
	   storefront can read them, so dropping them on the way there loses the
	   referral and logs nothing. Trim this list to change what survives. */
	private const CARRY_QUERY = array(
		'ref', 'aff', 'wpam_id', 'click_id', 'coupon_code', 'dcode', 'sub_id',
		'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
		'fbclid', 'gclid', 'ttclid', 'msclkid', 'irclickid', 'nvm-cart-return',
		'oppref', 'tpc_ms', 'tpc_src', 'tpc_med', 'tpc_camp', 'tpc_term', 'tpc_content',
		'gbraid', 'wbraid', 'dclid', '_gl', 'gad_source', 'gad_campaignid', 'srsltid',
		// The product feeds preselect a strength (?attribute_mg=10+MG); the storefront reads it too.
		'attribute_mg',
	);

	/* The longest value each key may carry. A click ID is kept whole or
	   dropped, never cut: a cut ID matches nothing. TikTok's ran to 418
	   characters on 9/24 and ChatGPT's oppref to 500. */
	private const CARRY_MAX = array(
		'fbclid' => 512, 'ttclid' => 512, 'oppref' => 500,
		'gclid' => 256, 'gbraid' => 256, 'wbraid' => 256, '_gl' => 2048,
	);

	/* Addresses WordPress itself never had, that only its 404 guess saved:
	   a broadcast to ~6,800 people linked the Spanish slug on the English
	   host, and a Google sitelink points at /contact/. */
	/* Pages WordPress keeps rendering. The affiliate pages run AffiliateWP's
	   own forms and sessions; /start/ is the only landing page of a live
	   Microsoft campaign (since Oct 7, the agency's Oct 12 reply). */
	private const OWNED_PAGE_SLUGS = array(
		'affiliate-area', 'affiliate-login-page', 'affiliate-registration-page', 'start', 'live', 'research',
	);

	private const LEGACY_PATHS = array(
		'product/glp-3-r' => '/product/glp-3-r',
		'contact'         => '/contact-us',
	);

	public static function boot(): void {
		add_filter( 'nvm_bridge_frontend_url', array( self::class, 'follow_handoff_origin' ) );
		add_action( 'template_redirect', array( self::class, 'route_customer_request' ), 4 );

		/* Only a storefront that has taken over customer traffic may tell
		 * crawlers to leave WordPress alone. While WordPress still owns the
		 * shop, its pages are the ones that must stay indexed. */
		if ( NVM_Headless_Bridge::nextjs_owns_traffic() ) {
			add_filter( 'wp_robots', array( self::class, 'block_backend_indexing' ) );
			add_filter( 'robots_txt', array( self::class, 'robots_txt' ), 99 );
		}

		if ( 'yes' === get_option( self::OPT_RETURN_LINK, 'yes' ) ) {
			add_action( 'wp_footer', array( self::class, 'render_return_link' ) );
		}
	}

	/** Use the validated origin stored with the active checkout handoff. */
	public static function follow_handoff_origin( $fallback ) {
		static $resolving = false;

		if ( $resolving ) {
			return $fallback;
		}

		$code = isset( $_COOKIE[ NVM_Headless_Bridge::RETURN_COOKIE ] )
			? (string) $_COOKIE[ NVM_Headless_Bridge::RETURN_COOKIE ]
			: '';

		if ( ! preg_match( '/\A[a-f0-9]{48}\z/D', $code ) ) {
			return $fallback;
		}

		$context = get_transient( NVM_Headless_Bridge::RETURN_PREFIX . hash( 'sha256', $code ) );

		if ( ! is_array( $context ) || empty( $context['frontend'] ) ) {
			return $fallback;
		}

		$origin    = (string) $context['frontend'];
		$resolving = true;
		$allowed   = NVM_Headless_Bridge::frontend_urls();
		$resolving = false;

		return in_array( $origin, $allowed, true ) ? $origin : $fallback;
	}

	public static function route_customer_request(): void {
		if ( ! NVM_Headless_Bridge::nextjs_owns_traffic() || self::machine_request() || ! function_exists( 'is_checkout' ) ) {
			return;
		}

		/* WordPress's own flows (emailed sign-in and password-reset links, the
		 * gate's steps) stay here: the same keys target_for_path() leaves
		 * alone. The redirect below carries only campaign keys, so sending one
		 * on would drop the reset key (the agency, Oct 21). */
		$params = array();
		wp_parse_str( (string) wp_parse_url( (string) wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_QUERY ), $params );
		if ( self::wordpress_key( $params ) ) {
			return;
		}

		if ( is_page() ) {
            $id = (int) get_queried_object_id();
            $settings = get_option( 'affwp_settings', array() );
            $registration = is_array( $settings ) ? (int) ( $settings['affiliates_registration_page'] ?? 0 ) : 0;
            if ( ( $registration && $id === $registration )
                || 'affiliate-registration-page' === trim( (string) get_page_uri( $id ), '/' )
                || has_shortcode( (string) get_post_field( 'post_content', $id ), 'affiliate_registration' ) ) {
                self::redirect( '/affiliate-registration-page', array(), 303 );
            }
            if ( self::is_affiliate_page() ) return;
        }

		/* Payment retries, gateway processing and receipts belong to WooCommerce. */
		if ( is_checkout() ) {
			if ( is_order_received_page() || is_wc_endpoint_url( 'order-pay' ) || isset( $_GET['wc-ajax'] ) ) {
				return;
			}

			if ( NVM_Headless_Bridge::checkout_account_required() && ! is_user_logged_in() ) {
				self::redirect( NVM_Headless_Bridge::path( 'account' ), array(
					'from'  => NVM_Headless_Bridge::path( 'api_checkout' ),
					'error' => 'signin_to_checkout',
				), 302 );
			}

			/* A plain checkout URL is not an entry point. A successful handoff
			 * creates the short-lived return binding that proves this browser
			 * arrived with an adopted cart and validated storefront origin. */
			if ( '' === self::follow_handoff_origin( '' ) ) {
				self::redirect( NVM_Headless_Bridge::path( 'cart' ), array( 'error' => 'checkout_handoff_required' ), 302 );
			}

			return;
		}

		if ( function_exists( 'is_cart' ) && is_cart() ) {
			self::redirect( NVM_Headless_Bridge::path( 'cart' ) );
		}

		if ( function_exists( 'is_account_page' ) && is_account_page() ) {
			/* These endpoints still depend on WooCommerce and payment-gateway
			 * templates. Keep them native until the storefront implements them. */
			if ( is_wc_endpoint_url( 'downloads' ) || is_wc_endpoint_url( 'payment-methods' ) || is_wc_endpoint_url( 'add-payment-method' ) ) {
				return;
			}
			self::redirect( self::account_path() );
		}

		if ( function_exists( 'is_shop' ) && is_shop() ) {
			self::redirect( NVM_Headless_Bridge::path( 'shop' ) );
		}

		if ( function_exists( 'is_product' ) && is_product() ) {
			self::redirect( NVM_Headless_Bridge::path( 'product', array(
				'slug' => sanitize_title( (string) get_post_field( 'post_name', get_queried_object_id() ) ),
			) ) );
		}

		if ( function_exists( 'is_product_category' ) && is_product_category() ) {
			$term = get_queried_object();
			self::redirect( NVM_Headless_Bridge::path( 'shop' ), array( 'category' => is_object( $term ) ? (string) $term->slug : '' ) );
		}

		if ( is_search() ) {
			self::redirect( NVM_Headless_Bridge::path( 'shop' ), array( 'search' => get_search_query( false ) ) );
		}

		if ( is_front_page() || is_home() ) {
			self::redirect( NVM_Headless_Bridge::path( 'home' ) );
		}

		if ( is_404() ) {
			$path = strtolower( trim( (string) wp_parse_url( (string) ( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH ), '/' ) );
			if ( isset( self::LEGACY_PATHS[ $path ] ) ) {
				self::redirect( self::LEGACY_PATHS[ $path ] );
			}
		}

		if ( is_page() ) {
			/* AffiliateWP owns its forms, sessions, referral cookies and dashboard.
			 * Sending these pages to a visual placeholder breaks login and signup. */
			if ( self::is_affiliate_page() ) {
				return;
			}
			self::redirect( self::page_path() );
		}
	}

	/** AffiliateWP's page ids. Its registration page is the storefront's (see route_customer_request). */
	private static function affiliate_page_ids( bool $with_registration = true ): array {
		$settings = get_option( 'affwp_settings', array() );
		$settings = is_array( $settings ) ? $settings : array();
		$ids = array(
			get_option( 'affwp_affiliate_area_page_id', 0 ),
			get_option( 'affiliate_wp_affiliate_area_page_id', 0 ),
			$settings['affiliates_page'] ?? 0,
			$settings['affiliate_area_page'] ?? 0,
			$settings['affiliates_login_page'] ?? 0,
			$settings['affiliate_login_page'] ?? 0,
		);
		if ( $with_registration ) {
			$ids[] = $settings['affiliates_registration_page'] ?? 0;
			$ids[] = $settings['affiliate_registration_page'] ?? 0;
		}

		return array_values( array_filter( array_map( 'absint', $ids ) ) );
	}

	private static function is_affiliate_page(): bool {
		$id = (int) get_queried_object_id();
		$ids = self::affiliate_page_ids();
		if ( $id && in_array( $id, $ids, true ) ) {
			return true;
		}
		$content = (string) get_post_field( 'post_content', $id );
		foreach ( array( 'affiliate_area', 'affiliate_login', 'affiliate_registration' ) as $shortcode ) {
			if ( has_shortcode( $content, $shortcode ) ) return true;
		}
		$slug = trim( (string) get_page_uri( $id ), '/' );
		$slugs = apply_filters( 'nvm_bridge_wordpress_owned_page_slugs', self::OWNED_PAGE_SLUGS );
		return in_array( $slug, is_array( $slugs ) ? $slugs : array(), true );
	}

	/**
	 * The storefront path for a WordPress address, or null when WordPress
	 * keeps it (the agency contract, e1 and e4).
	 *
	 * Path-based, so it works at `init` before WordPress has parsed the
	 * request, and for a destination stored earlier. The path itself is kept:
	 * the storefront owns the whole old-address map (every product, category,
	 * account and sign-up URL, tested against the full WordPress URL list), so
	 * one map serves both sides. A Spanish path loses its /es prefix, because
	 * the Spanish storefront has its own host. Only the campaign keys in
	 * CARRY_QUERY travel, whole or not at all.
	 */
	public static function target_for_path( string $path_and_query, string $lang ): ?string {
		$path_and_query = NVM_Headless_Bridge::safe_path( $path_and_query );
		if ( '' === $path_and_query || strlen( $path_and_query ) > 8192 ) {
			return null;
		}

		$path = (string) wp_parse_url( $path_and_query, PHP_URL_PATH );
		$raw  = (string) wp_parse_url( $path_and_query, PHP_URL_QUERY );
		if ( '' === $path || '/' !== $path[0] ) {
			return null;
		}

		$params = array();
		wp_parse_str( $raw, $params );
		if ( self::wordpress_owned( $path, $params ) ) {
			return null;
		}

		if ( 'es' === strtolower( $lang ) && preg_match( '#\A/es(?:/|\z)#i', $path ) ) {
			$path = '' === (string) substr( $path, 3 ) ? '/' : (string) substr( $path, 3 );
		}

		$query = self::carried_from( $params, $raw );

		return $query ? $path . '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ) : $path;
	}

	/**
	 * The absolute storefront URL for this request, or null when WordPress
	 * keeps it (the agency's e1 hand-off at `init`). Null as well while no
	 * storefront may take production visitors, the same guard redirect() keeps.
	 */
	public static function target_for_request(): ?string {
		if ( self::machine_request() ) {
			return null;
		}

		$uri  = (string) wp_unslash( $_SERVER['REQUEST_URI'] ?? '' );
		$lang = NVM_Headless_Bridge::known_locale( (string) apply_filters( 'wpml_current_language', null ) );
		if ( '' === $lang && preg_match( '#\A/es(?:[/?]|\z)#i', $uri ) ) {
			$lang = 'es';
		}

		$path = self::target_for_path( $uri, $lang );
		if ( null === $path ) {
			return null;
		}

		$frontend = NVM_Headless_Bridge::origin_for_locale( $lang );
		$local    = 'local' === wp_get_environment_type()
			&& in_array( $frontend, NVM_Headless_Bridge::frontend_urls(), true );
		if ( '' === $frontend || ( ! $local && ! NVM_Headless_Bridge::production_origin_ready() ) ) {
			return null;
		}

		$target_host = strtolower( (string) wp_parse_url( $frontend, PHP_URL_HOST ) );
		$this_host   = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		if ( '' === $target_host || ( $target_host === $this_host && ! $local ) ) {
			return null;
		}

		return $frontend . $path;
	}

	/* Query keys of the flows WordPress still runs: its emailed sign-in and
	   password-reset links, the gate's own steps, payment callbacks. A
	   destination carrying one stays on WordPress, or the storefront would
	   only send it back. */
	private const WORDPRESS_KEYS = array(
		'tpc_sl', 'tpc_ct', 'view', 'reset', 'show-reset-form', 'tpc_registered', 'tpc_inapp',
		'password-reset', 'reset-link-sent', 'wc-api', 'wc-ajax', 'pay_for_order', 'key',
	);
	private const WORDPRESS_KEY_PREFIXES = array( 'nvm-', 'wapu_' );

	/* First path segments that are WordPress's machinery, never a page. */
	private const WORDPRESS_ROOTS = array(
		'wp-admin', 'wp-login.php', 'wp-json', 'wp-content', 'wp-includes', 'wp-cron.php',
		'xmlrpc.php', 'wc-api', 'bingsiteauth.xml',
	);

	/** Whether a query carries one of WordPress's own flow keys. */
	private static function wordpress_key( array $params ): bool {
		foreach ( array_keys( $params ) as $key ) {
			$key = strtolower( (string) $key );
			if ( in_array( $key, self::WORDPRESS_KEYS, true ) ) {
				return true;
			}
			foreach ( self::WORDPRESS_KEY_PREFIXES as $prefix ) {
				if ( 0 === strpos( $key, $prefix ) ) {
					return true;
				}
			}
		}

		return false;
	}

	private static function wordpress_owned( string $path, array $params ): bool {
		if ( self::wordpress_key( $params ) ) {
			return true;
		}

		$bare = (string) preg_replace( '#\Aes(?:/|\z)#', '', strtolower( trim( rawurldecode( $path ), '/' ) ) );
		$root = explode( '/', $bare, 2 )[0];
		if ( in_array( $root, self::WORDPRESS_ROOTS, true ) ) {
			return true;
		}

		foreach ( self::wordpress_paths() as $owned ) {
			if ( $bare === $owned || 0 === strpos( $bare, $owned . '/' ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Page paths WordPress keeps, in every language the site runs: checkout
	 * (order-pay and order-received live under it), the account screens it
	 * still renders, and the AffiliateWP pages.
	 */
	private static function wordpress_paths(): array {
		static $paths = null;
		if ( null !== $paths ) {
			return $paths;
		}

		$pages   = self::affiliate_page_ids( false );
		$account = 0;
		if ( function_exists( 'wc_get_page_id' ) ) {
			$pages[] = (int) wc_get_page_id( 'checkout' );
			$account = (int) wc_get_page_id( 'myaccount' );
		}

		$languages = apply_filters( 'wpml_active_languages', null, array( 'skip_missing' => 0 ) );
		$codes     = is_array( $languages ) && $languages ? array_keys( $languages ) : array( '' );
		$uri       = static function ( int $id, string $code ): string {
			if ( $id <= 0 ) {
				return '';
			}
			$local = '' === $code ? $id : (int) apply_filters( 'wpml_object_id', $id, 'page', true, $code );
			return $local > 0 ? strtolower( trim( (string) get_page_uri( $local ), '/' ) ) : '';
		};

		$found = array();
		foreach ( $codes as $code ) {
			foreach ( $pages as $id ) {
				$found[] = $uri( (int) $id, (string) $code );
			}
			$base = $uri( $account, (string) $code );
			if ( '' !== $base ) {
				foreach ( array( 'downloads', 'payment_methods', 'add_payment_method' ) as $endpoint ) {
					$slug = trim( (string) get_option( 'woocommerce_myaccount_' . $endpoint . '_endpoint', str_replace( '_', '-', $endpoint ) ), '/' );
					if ( '' !== $slug ) {
						$found[] = $base . '/' . strtolower( $slug );
					}
				}
			}
		}

		$slugs = apply_filters( 'nvm_bridge_wordpress_owned_page_slugs', self::OWNED_PAGE_SLUGS );
		foreach ( is_array( $slugs ) ? $slugs : array() as $slug ) {
			$found[] = strtolower( trim( (string) $slug, '/' ) );
		}

		// The registration page is the storefront's (route_customer_request sends it there).
		$found = array_diff( $found, array( '', 'affiliate-registration-page' ) );
		$paths = array_values( array_unique( $found ) );

		return $paths;
	}

	private static function machine_request(): bool {
		return self::trusted_server_request()
			|| isset( $_GET['wc-api'] )
			|| '' !== (string) get_query_var( 'wc-api' )
			|| is_admin()
			|| wp_doing_ajax()
			|| wp_doing_cron()
			|| ( defined( 'REST_REQUEST' ) && REST_REQUEST )
			|| ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST )
			|| ( defined( 'WP_CLI' ) && WP_CLI );
	}

	private static function trusted_server_request(): bool {
		$provided = (string) ( $_SERVER['HTTP_X_NVM_BRIDGE_KEY'] ?? '' );

		return '' !== $provided && hash_equals( NVM_Headless_Bridge::secret(), $provided );
	}

	private static function account_path(): string {
		if ( function_exists( 'is_wc_endpoint_url' ) ) {
			if ( is_wc_endpoint_url( 'orders' ) ) return NVM_Headless_Bridge::path( 'account_orders' );
			if ( is_wc_endpoint_url( 'view-order' ) ) {
				return NVM_Headless_Bridge::path( 'account_order', array(
					'order_id' => absint( get_query_var( 'view-order' ) ),
				) );
			}
			if ( is_wc_endpoint_url( 'downloads' ) ) return NVM_Headless_Bridge::path( 'account_downloads' );
			if ( is_wc_endpoint_url( 'edit-address' ) ) {
				$kind = 'shipping' === get_query_var( 'edit-address' ) ? 'shipping' : 'billing';
				return NVM_Headless_Bridge::path( 'account_addresses', array( 'kind' => $kind ) );
			}
			if ( is_wc_endpoint_url( 'edit-account' ) ) return NVM_Headless_Bridge::path( 'account_details' );
			if ( is_wc_endpoint_url( 'payment-methods' ) || is_wc_endpoint_url( 'add-payment-method' ) ) {
				return NVM_Headless_Bridge::path( 'account_payment' );
			}
			if ( is_wc_endpoint_url( 'lost-password' ) ) return NVM_Headless_Bridge::path( 'account_lost_password' );
		}

		return NVM_Headless_Bridge::path( 'account' );
	}

	/**
	 * WordPress page slug -> storefront path, for the pages whose storefront
	 * URL is not simply the same slug.
	 *
	 * The shipped entries cover the legal pages WooCommerce expects a shop to
	 * publish, pointed at the `legal_*` entries of the path contract. A
	 * storefront that files them somewhere else replaces the map through the
	 * option or the filter; every other page keeps falling through to its own
	 * slug, so a site that matches WordPress one-for-one needs no
	 * configuration at all.
	 */
	private static function page_map(): array {
		$map = array(
			'privacy-policy'          => NVM_Headless_Bridge::path( 'legal_privacy' ),
			'shipping-policy'         => NVM_Headless_Bridge::path( 'legal_shipping' ),
			'shipping-returns-policy' => NVM_Headless_Bridge::path( 'legal_shipping' ),
			'terms-conditions'        => NVM_Headless_Bridge::path( 'legal_terms' ),
			'terms-and-conditions'    => NVM_Headless_Bridge::path( 'legal_terms' ),
		);

		$stored = get_option( 'nvm_bridge_page_map', array() );

		if ( is_array( $stored ) ) {
			$map = array_merge( $map, $stored );
		}

		$map = apply_filters( 'nvm_bridge_page_map', $map );

		/* A mapping that is not a usable path would send a customer off the
		 * storefront entirely. Drop those entries and let the slug fall
		 * through instead. */
		$safe = array();

		foreach ( is_array( $map ) ? $map : array() as $slug => $path ) {
			$path = NVM_Headless_Bridge::safe_path( $path );

			if ( '' !== $path ) {
				$safe[ (string) $slug ] = $path;
			}
		}

		return $safe;
	}

	private static function page_path(): string {
		$slug = trim( (string) get_page_uri( get_queried_object_id() ), '/' );
		$map  = self::page_map();

		if ( isset( $map[ $slug ] ) ) return $map[ $slug ];

		return '' === $slug ? NVM_Headless_Bridge::path( 'home' ) : '/' . $slug;
	}

	/**
	 * The part of the incoming query string that must survive the hop.
	 *
	 * Values are capped because they end up in a Location header, and an
	 * unbounded one is a 500 rather than a redirect.
	 */
	private static function carried_query(): array {
		return self::carried_from( wp_unslash( $_GET ), (string) ( $_SERVER['QUERY_STRING'] ?? '' ) );
	}

	/** The same rule for any query: its parsed, unslashed values and its raw string. */
	private static function carried_from( array $params, string $raw ): array {
		$carried = array();

		foreach ( self::CARRY_QUERY as $key ) {
			// Do not turn duplicate/encoded Microsoft account markers into a valid B marker.
			if ('tpc_ms' === $key) {
				$markers = array_filter(explode('&', $raw), static fn($part) => 'tpc_ms' === urldecode(explode('=', $part, 2)[0]));
				if (empty($params['msclkid']) || 1 !== count($markers)
					|| !preg_match('/(?:^|&)tpc_ms=[ab](?:&|$)/', $raw)) continue;
			}
			if ( ! isset( $params[ $key ] ) || ! is_scalar( $params[ $key ] ) ) {
				continue;
			}

			$value = sanitize_text_field( (string) $params[ $key ] );

			$max = self::CARRY_MAX[ $key ] ?? 200;
			if ( '' !== $value && strlen($value) <= $max ) {
				$carried[ $key ] = $value;
			}
		}

		return $carried;
	}

	/* Temporary by default until the cutover's rollback window has passed (the
	   agency's Q12): a browser keeps a 301 indefinitely, so after a rollback
	   (www -> apex) a cached apex -> www would loop. */
	private static function redirect( string $path, array $query = array(), int $status = 302 ): void {
		/* One storefront per language, so the destination is the one that serves
		   the language of the page being left, not the single configured origin.
		   Without this a Spanish page sends its reader to the English site. */
		$frontend = NVM_Headless_Bridge::origin_for_locale(
			(string) apply_filters( 'wpml_current_language', null )
		);
		$bound     = self::follow_handoff_origin( '' );

		if ( '' === $frontend ) {
			return;
		}

		/* A local/preview origin may finish its own bound handoff, but it must
		 * never become the fallback for an unrelated production visitor. */
        // Local WordPress may exercise the cutover against its explicit local
        // allowlist. Production and staging retain the production-origin guard.
        $local = 'local' === wp_get_environment_type()
            && in_array( $frontend, NVM_Headless_Bridge::frontend_urls(), true );
		if ( $frontend !== $bound && ! $local && ! NVM_Headless_Bridge::production_origin_ready() ) {
			return;
		}

		$target_host = strtolower( (string) wp_parse_url( $frontend, PHP_URL_HOST ) );
		$this_host   = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );

		if ( '' === $target_host || ( $target_host === $this_host && ! $local ) || untrailingslashit( $frontend ) === untrailingslashit( home_url() ) ) {
			return;
		}

		$url = $frontend . '/' . ltrim( $path, '/' );
		/* The router's own arguments win any collision; nothing it passes shares
		   a name with CARRY_QUERY today. */
		$query = array_merge( self::carried_query(), $query );
		$query = array_filter( $query, static fn( $value ) => '' !== (string) $value );

		if ( $query ) {
			$url = add_query_arg( $query, $url );
		}

		/* The one-time sign-in return (2.7.5, the agency's Oct 12 reply: shoppers
		 * signed in on WordPress must arrive signed in). WordPress logins never
		 * expire, so at cutover a signed-in shopper is sent once through the
		 * bridge's auth return, which signs them in on the storefront and lands
		 * them on the same page. A cookie marks it done for this browser; after
		 * that the storefront's own session carries them. */
		if ( is_user_logged_in() && empty( $_COOKIE[ self::RETURNED_COOKIE ] ) && ! headers_sent()
			&& 'no' !== get_option( self::OPT_SIGNED_IN_RETURN, 'yes' ) ) {
			setcookie( self::RETURNED_COOKIE, '1', array(
				'expires'  => time() + YEAR_IN_SECONDS,
				'path'     => '/',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			) );
			$to   = '/' . ltrim( $path, '/' ) . ( $query ? '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ) : '' );
			$lang = NVM_Headless_Bridge::known_locale( (string) apply_filters( 'wpml_current_language', null ) );
			$url  = add_query_arg( array_filter( array(
				'nvm-auth-return' => 1,
				'auth_version'    => 2,
				'to'              => rawurlencode( $to ),
				'lang'            => $lang,
			) ), home_url( '/' ) );
		}

		nocache_headers();
		do_action( 'litespeed_control_set_nocache', 'nvm storefront redirect' );
		wp_redirect( esc_url_raw( $url ), $status, 'NVM Headless Core' );
		exit;
	}

	public static function render_return_link(): void {
		if ( ! NVM_Headless_Bridge::nextjs_owns_traffic() && '' === self::follow_handoff_origin( '' ) ) {
			return;
		}

		if ( ! function_exists( 'is_checkout' ) || ( ! is_checkout() && ! is_order_received_page() ) ) {
			return;
		}

		if (
			is_order_received_page()
			&& NVM_Headless_Bridge::receipt_actions_enabled()
			&& class_exists( 'NVM_Checkout_Skin' )
			&& NVM_Checkout_Skin::skin_enabled()
		) {
			return;
		}

		printf(
			'<a class="nvm-return-link" href="%s">&larr; %s</a>',
			esc_url( home_url( '/?nvm-cart-return=1' ) ),
			esc_html__( 'Back to shop', 'nvm-headless-bridge' )
		);
	}

	public static function block_backend_indexing( array $robots ): array {
		$robots['noindex']  = true;
		$robots['nofollow'] = true;
		unset( $robots['index'], $robots['follow'] );

		return $robots;
	}

	public static function robots_txt(): string {
		return "User-agent: *\nDisallow: /\n";
	}
}
