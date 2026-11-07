<?php
/**
 * The product contract: `extensions.tpc` on Store API products.
 *
 * The storefront reads its whole catalogue from
 * `GET /wp-json/nvm/v1/catalog`; the bridge dispatches to the Store API
 * internally. Everything the Store
 * API does not already say about a product - the storefront key, the shop
 * category, the strength printed on the pack render, the current lot and the
 * certificate history, and each variation's price and stock - is published
 * here under one namespace. Section 1 of docs/integration-contract.md is the
 * shape; this file is the only place it is produced.
 *
 * Two costs are kept flat on purpose. Variation prices are read through
 * `wc_get_product`, which WooCommerce caches per request, and formatted by the
 * Store API's own money formatter so a variation's "18900" is built the same
 * way as its parent's. Certificates come from `{prefix}coa_reports_history`
 * in one query for the whole table on first use, then from a static map, so a
 * hundred-product list still costs one certificates query.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Product_Contract {

	const CONTRACT     = 1;
	const NS           = 'tpc';
	const OPTION_KEYS  = 'tpc_storefront_keys';
	const META_KEY     = '_tpc_product_key';
	const META_IMAGE   = '_tpc_image_strength';
	const ORDER_LATEST = 'certificate_date DESC, uploaded_date DESC, id DESC';

	/** @var array<int, array<int, array>>|null Certificate rows grouped by product_id, or null before the first read. */
	private static $certificates = null;

	/** @var bool|null Whether the certificates table exists; null until checked. */
	private static $table_exists = null;

	public static function boot(): void {
		add_action( 'plugins_loaded', array( self::class, 'install' ) );
		add_action( 'woocommerce_blocks_loaded', array( self::class, 'register' ) );
	}

	/**
	 * Seed the alias option once, so it is visible and editable in the
	 * options table. `add_option` leaves an existing value alone, so a map an
	 * operator has already changed is never reset.
	 */
	public static function install(): void {
		if ( false === get_option( self::OPTION_KEYS, false ) ) {
			add_option( self::OPTION_KEYS, self::default_aliases(), '', false );
		}
	}

	/* ---------------------------------------------------------- Registration */

	/**
	 * Register once, on the product schema.
	 *
	 * The collection and the single-product route both render through
	 * `ProductSchema`, so one registration covers `/products` and
	 * `/products/{id}`. The container route is preferred; the global function
	 * is the same call for older WooCommerce builds.
	 */
	public static function register(): void {
		$args = array(
			'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema::IDENTIFIER,
			'namespace'       => self::NS,
			'data_callback'   => array( self::class, 'data' ),
			'schema_callback' => array( self::class, 'schema' ),
			'schema_type'     => ARRAY_A,
		);

		if ( class_exists( '\Automattic\WooCommerce\StoreApi\StoreApi' ) && class_exists( '\Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema' ) ) {
			\Automattic\WooCommerce\StoreApi\StoreApi::container()
				->get( \Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema::class )
				->register_endpoint_data( $args );
			return;
		}

		if ( function_exists( 'woocommerce_store_api_register_endpoint_data' ) ) {
			woocommerce_store_api_register_endpoint_data( $args );
		}
	}

	/* ------------------------------------------------------------------ Data */

	/**
	 * The `extensions.tpc` object for one product.
	 *
	 * A variation asked for directly answers with its parent's contract, so
	 * `/products/{variation_id}` and `/products/{parent_id}` agree.
	 *
	 * @param WC_Product $product
	 */
	public static function data( $product ): array {
		if ( ! $product instanceof WC_Product ) {
			return self::empty_contract();
		}

		if ( $product->is_type( 'variation' ) ) {
			$parent = wc_get_product( $product->get_parent_id() );
			if ( $parent instanceof WC_Product ) {
				$product = $parent;
			}
		}

		$product_id = $product->get_id();
		$variations = $product->is_type( 'variable' ) ? self::variations( $product ) : array();
		$key        = self::key_for( $product );

		return array(
			'contract'       => self::CONTRACT,
			'key'            => $key,
			'category'       => self::category_for( $product ),
			'image_strength' => self::image_strength( $product, $variations ),
			'lot'            => self::lot_for( $product_id ),
			'certificates'   => self::certificates_for( $product_id ),
			'coa'            => self::coa_for( $key ),
			'variations'     => $variations,
		);
	}

	/**
	 * The certificate picture and purity the product page shows.
	 *
	 * Resolved by the lab report module, which owns the title matching, so the
	 * storefront's gallery lands on the same document the WordPress product
	 * page does. Without that module there is no certificate to name, and an
	 * empty answer is what makes the storefront draw one image instead of two.
	 *
	 * @return array{image:string, width:int, height:int, purity:string, lot:string}
	 */
	private static function coa_for( string $key ): array {
		if ( '' !== $key && class_exists( 'TPC_Lab_Reports' ) ) {
			return TPC_Lab_Reports::coa_for( $key );
		}

		return array(
			'image'  => '',
			'width'  => 0,
			'height' => 0,
			'purity' => '',
			'lot'    => '',
		);
	}

	private static function empty_contract(): array {
		return array(
			'contract'       => self::CONTRACT,
			'key'            => '',
			'category'       => 'Research Peptides',
			'image_strength' => null,
			'lot'            => null,
			'certificates'   => array(),
			'variations'     => array(),
		);
	}

	/**
	 * Storefront key: an explicit `_tpc_product_key` meta wins, then the alias
	 * map keyed by slug, then the slug itself. The alias map exists so that a
	 * WordPress slug like `r` can stay as it is while the storefront shows
	 * `glp-3-r`.
	 */
	public static function key_for( WC_Product $product ): string {
		$meta = trim( (string) $product->get_meta( self::META_KEY, true, 'edit' ) );
		if ( '' !== $meta ) {
			return $meta;
		}

		$slug    = (string) $product->get_slug();
		$aliases = self::aliases();

		return isset( $aliases[ $slug ] ) ? $aliases[ $slug ] : $slug;
	}

	/** Default aliases from the contract; the option may replace the whole map. */
	public static function default_aliases(): array {
		// Spectrum's WordPress slugs are its storefront keys; add aliases here if one ever differs.
		return array();
	}

	/** @return array<string, string> slug => storefront key. */
	public static function aliases(): array {
		$stored = get_option( self::OPTION_KEYS, null );
		if ( is_string( $stored ) && '' !== $stored ) {
			$decoded = json_decode( $stored, true );
			$stored  = is_array( $decoded ) ? $decoded : null;
		}
		$map   = is_array( $stored ) ? $stored : self::default_aliases();
		$clean = array();
		foreach ( $map as $slug => $key ) {
			$slug = sanitize_title( (string) $slug );
			$key  = sanitize_title( (string) $key );
			if ( '' !== $slug && '' !== $key ) {
				$clean[ $slug ] = $key;
			}
		}
		return $clean;
	}

	/** Reverse lookup: storefront key => product id, for the CLI and the webhook. */
	public static function product_id_for_key( string $key ): int {
		$key = sanitize_title( $key );
		if ( '' === $key ) {
			return 0;
		}

		$by_meta = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_key'       => self::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		if ( $by_meta ) {
			return (int) $by_meta[0];
		}

		$slug = array_search( $key, self::aliases(), true );
		$slug = false === $slug ? $key : (string) $slug;
		$post = get_page_by_path( $slug, OBJECT, 'product' );

		return $post instanceof WP_Post ? (int) $post->ID : 0;
	}

	/**
	 * Same rule as `categoryFor()` in the storefront: the first matching word
	 * across every `product_cat` slug wins, in this order.
	 */
	public static function category_for( WC_Product $product ): string {
		$terms = get_the_terms( $product->get_id(), 'product_cat' );
		$slugs = array();
		if ( is_array( $terms ) ) {
			foreach ( $terms as $term ) {
				$slugs[] = (string) $term->slug;
			}
		}
		$joined = strtolower( implode( ' ', $slugs ) );

		if ( false !== strpos( $joined, 'blend' ) ) {
			return 'Research Blends';
		}
		if ( false !== strpos( $joined, 'solution' ) ) {
			return 'Research Solutions';
		}
		if ( false !== strpos( $joined, 'compound' ) ) {
			return 'Research Compounds';
		}
		return 'Research Peptides';
	}

	/**
	 * The strength printed on the pack render. The meta the shop already
	 * fills in wins; otherwise the lowest variation strength, which is the
	 * one the storefront selector opens on. Null for a simple product with
	 * no meta.
	 */
	private static function image_strength( WC_Product $product, array $variations ): ?string {
		$meta = trim( (string) $product->get_meta( self::META_IMAGE, true, 'edit' ) );
		if ( '' !== $meta ) {
			return $meta;
		}
		foreach ( $variations as $variation ) {
			if ( '' !== $variation['strength'] ) {
				return $variation['strength'];
			}
		}
		return null;
	}

	/* ------------------------------------------------------------ Variations */

	/**
	 * One row per visible variation, in ascending strength order so the
	 * storefront's default selection is the smallest vial.
	 *
	 * @return array<int, array>
	 */
	private static function variations( WC_Product $product ): array {
		$rows = array();
		foreach ( $product->get_visible_children() as $child_id ) {
			$variation = wc_get_product( $child_id );
			if ( ! $variation instanceof WC_Product_Variation ) {
				continue;
			}
			$rows[] = array(
				'id'            => $variation->get_id(),
				'strength'      => self::strength_for( $variation ),
				'price'         => self::money( $variation ),
				'regular_price' => self::money( $variation, $variation->get_regular_price() ),
				'in_stock'      => $variation->is_in_stock(),
				'lot'           => self::lot_for( $variation->get_id() ),
				'certificates'  => self::certificates_for( $variation->get_id() ),
			);
		}

		usort(
			$rows,
			static function ( array $a, array $b ): int {
				return self::strength_value( $a['strength'] ) <=> self::strength_value( $b['strength'] );
			}
		);

		return $rows;
	}

	/** "40 MG" -> 40.0; anything without a number sorts last. */
	private static function strength_value( string $strength ): float {
		return preg_match( '/([\d.]+)/', $strength, $m ) ? (float) $m[1] : INF;
	}

	/**
	 * The option of the first attribute whose name contains "strength"
	 * (case-insensitive), otherwise every attribute option joined by a space.
	 * Attribute names arrive as `attribute_pa_strength` style keys and as
	 * taxonomy slugs; the option is resolved to its term name when it is one.
	 */
	public static function strength_for( WC_Product_Variation $variation ): string {
		$attributes = $variation->get_variation_attributes( false );
		$labels     = array();

		foreach ( $attributes as $name => $option ) {
			$option = (string) $option;
			if ( '' === $option ) {
				continue;
			}
			$taxonomy = str_replace( 'attribute_', '', (string) $name );
			if ( taxonomy_exists( $taxonomy ) ) {
				$term = get_term_by( 'slug', $option, $taxonomy );
				if ( $term instanceof WP_Term ) {
					$option = $term->name;
				}
			}
			$label = function_exists( 'wc_attribute_label' ) ? wc_attribute_label( $taxonomy, $variation ) : $taxonomy;
			if ( false !== stripos( $label, 'strength' ) || false !== stripos( $taxonomy, 'strength' ) ) {
				return $option;
			}
			$labels[] = $option;
		}

		return implode( ' ', $labels );
	}

	/* ---------------------------------------------------------------- Prices */

	/**
	 * A price in minor units, built the way `ProductSchema` builds the
	 * parent's: the shop's tax display mode picks the incl/excl function, and
	 * the Store API money formatter rounds half up to `wc_get_price_decimals`
	 * places and drops the point.
	 *
	 * @param WC_Product  $product
	 * @param string|null $price   A price to format instead of the product's own.
	 */
	public static function money( WC_Product $product, ?string $price = null ): string {
		$args = null === $price ? array() : array( 'price' => $price );
		$mode = get_option( 'woocommerce_tax_display_shop' );
		$raw  = 'incl' === $mode
			? wc_get_price_including_tax( $product, $args )
			: wc_get_price_excluding_tax( $product, $args );

		$decimals = wc_get_price_decimals();

		if ( class_exists( '\Automattic\WooCommerce\StoreApi\StoreApi' ) && class_exists( '\Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema' ) ) {
			try {
				$formatter = \Automattic\WooCommerce\StoreApi\StoreApi::container()
					->get( \Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema::class )
					->get_formatter( 'money' );
				return (string) $formatter->format(
					$raw,
					array(
						'decimals'      => $decimals,
						'rounding_mode' => PHP_ROUND_HALF_UP,
					)
				);
			} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
				// Fall through to the same arithmetic the formatter uses.
			}
		}

		return (string) intval( round( ( (float) $raw ) * ( 10 ** $decimals ), 0, PHP_ROUND_HALF_UP ) );
	}

	/* ---------------------------------------------------------- Certificates */

	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'coa_reports_history';
	}

	private static function table_exists(): bool {
		if ( null !== self::$table_exists ) {
			return self::$table_exists;
		}
		global $wpdb;
		$table              = self::table();
		$found              = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
		self::$table_exists = is_string( $found ) && strtolower( $found ) === strtolower( $table );
		return self::$table_exists;
	}

	/**
	 * The ORDER BY the certificates plugin uses for "current first", when it
	 * is loaded, else newest first. The constant is a trusted PHP value, but
	 * it still has to look like a column list before it goes into SQL.
	 */
	private static function order_clause(): string {
		if ( class_exists( 'COA_Database' ) && defined( 'COA_Database::ORDER_CURRENT' ) ) {
			$clause = trim( (string) constant( 'COA_Database::ORDER_CURRENT' ) );
			$clause = preg_replace( '/^ORDER\s+BY\s+/i', '', $clause );
			if ( '' !== $clause && preg_match( '/^[A-Za-z0-9_.,\s]+$/', $clause ) ) {
				return $clause;
			}
		}
		return self::ORDER_LATEST;
	}

	/**
	 * Every certificate row, grouped by product id, read once per request.
	 *
	 * @return array<int, array<int, array>>
	 */
	private static function all_certificates(): array {
		if ( null !== self::$certificates ) {
			return self::$certificates;
		}

		self::$certificates = array();

		if ( ! self::table_exists() ) {
			return self::$certificates;
		}

		global $wpdb;
		$table = self::table();
		$order = self::order_clause();
		$rows  = $wpdb->get_results( "SELECT id, product_id, certificate_title, certificate_url, certificate_id, batch_number, certificate_date, uploaded_date, is_current FROM {$table} ORDER BY {$order}", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		if ( ! is_array( $rows ) ) {
			return self::$certificates;
		}

		foreach ( $rows as $row ) {
			$product_id = (int) $row['product_id'];
			if ( $product_id < 1 ) {
				continue;
			}
			self::$certificates[ $product_id ][] = array(
				'id'      => (int) $row['id'],
				'title'   => (string) $row['certificate_title'],
				'url'     => (string) $row['certificate_url'],
				'batch'   => '' !== trim( (string) $row['batch_number'] ) ? trim( (string) $row['batch_number'] ) : null,
				'date'    => self::date_only( (string) $row['certificate_date'] ),
				'current' => (bool) (int) $row['is_current'],
			);
		}

		return self::$certificates;
	}

	/** "2026-08-30 14:02:11" -> "2026-08-30"; a zero or empty date is null. */
	private static function date_only( string $value ): ?string {
		$value = trim( $value );
		if ( '' === $value || 0 === strpos( $value, '0000-00-00' ) ) {
			return null;
		}
		return substr( $value, 0, 10 );
	}

	/** @return array<int, array> Full history for one product or variation id. */
	public static function certificates_for( int $product_id ): array {
		$all = self::all_certificates();
		return isset( $all[ $product_id ] ) ? $all[ $product_id ] : array();
	}

	/** `batch_number` of the current row for this id, or null. */
	public static function lot_for( int $product_id ): ?string {
		foreach ( self::certificates_for( $product_id ) as $row ) {
			if ( $row['current'] && null !== $row['batch'] ) {
				return $row['batch'];
			}
		}
		return null;
	}

	/** Drop the request-level memo, for tests and for long-running CLI loops. */
	public static function reset(): void {
		self::$certificates = null;
		self::$table_exists = null;
	}

	/* ---------------------------------------------------------------- Schema */

	private static function certificate_schema(): array {
		return array(
			'type'  => 'array',
			'items' => array(
				'type'       => 'object',
				'properties' => array(
					'id'      => array( 'type' => 'integer' ),
					'title'   => array( 'type' => 'string' ),
					'url'     => array( 'type' => 'string' ),
					'batch'   => array( 'type' => array( 'string', 'null' ) ),
					'date'    => array( 'type' => array( 'string', 'null' ) ),
					'current' => array( 'type' => 'boolean' ),
				),
			),
		);
	}

	public static function schema(): array {
		return array(
			'contract'       => array(
				'description' => __( 'Product contract version.', 'peptide-collective-commerce' ),
				'type'        => 'integer',
				'readonly'    => true,
			),
			'key'            => array(
				'description' => __( 'Storefront product key. The slug unless aliased.', 'peptide-collective-commerce' ),
				'type'        => 'string',
				'readonly'    => true,
			),
			'category'       => array(
				'description' => __( 'Storefront category derived from product categories.', 'peptide-collective-commerce' ),
				'type'        => 'string',
				'enum'        => array( 'Research Peptides', 'Research Blends', 'Research Compounds', 'Research Solutions' ),
				'readonly'    => true,
			),
			'image_strength' => array(
				'description' => __( 'Strength printed on the pack render.', 'peptide-collective-commerce' ),
				'type'        => array( 'string', 'null' ),
				'readonly'    => true,
			),
			'lot'            => array(
				'description' => __( 'Current lot for the parent product.', 'peptide-collective-commerce' ),
				'type'        => array( 'string', 'null' ),
				'readonly'    => true,
			),
			'certificates'   => array_merge(
				array(
					'description' => __( 'Certificate history for the parent product, current first.', 'peptide-collective-commerce' ),
					'readonly'    => true,
				),
				self::certificate_schema()
			),
			'coa'            => array(
				'description' => __( 'The certificate picture the product page shows beside the vial, and the purity printed on it. Empty strings when the product has no real certificate.', 'peptide-collective-commerce' ),
				'type'        => 'object',
				'readonly'    => true,
				'properties'  => array(
					'image'  => array( 'type' => 'string' ),
					'width'  => array( 'type' => 'integer' ),
					'height' => array( 'type' => 'integer' ),
					'purity' => array( 'type' => 'string' ),
					'lot'    => array( 'type' => 'string' ),
				),
			),
			'variations'     => array(
				'description' => __( 'Variations with prices in currency minor units. Empty for simple products.', 'peptide-collective-commerce' ),
				'type'        => 'array',
				'readonly'    => true,
				'items'       => array(
					'type'       => 'object',
					'properties' => array(
						'id'            => array( 'type' => 'integer' ),
						'strength'      => array( 'type' => 'string' ),
						'price'         => array( 'type' => 'string' ),
						'regular_price' => array( 'type' => 'string' ),
						'in_stock'      => array( 'type' => 'boolean' ),
						'lot'           => array( 'type' => array( 'string', 'null' ) ),
						'certificates'  => self::certificate_schema(),
					),
				),
			),
		);
	}
}
