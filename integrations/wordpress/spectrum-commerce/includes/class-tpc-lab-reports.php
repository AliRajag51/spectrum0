<?php
/**
 * Lab reports: the analytical numbers, published as one public read.
 *
 * WordPress holds certificates in two places. `{prefix}coa_reports_history`
 * is the PDF trail and already travels on `extensions.tpc.certificates`. The
 * `lab-report` post type is the other half - purity, weight, endotoxins,
 * sterility, heavy metals - and until now nothing published it, so the numbers
 * on the storefront were a hand-written file that could not follow WordPress.
 * Section 9 of docs/integration-contract.md is the shape; this file is the
 * only place it is produced.
 *
 * Three decisions worth knowing before changing anything here:
 *
 * - Values are published verbatim. An empty `sterility` stays empty; it never
 *   becomes "Pass". These strings end up on a page that tells a customer what
 *   was tested, so inventing one is worse than showing none.
 * - A date that does not parse is published as "". Never today's date: a lot
 *   dated now, because a field was malformed, reads as the newest lot and
 *   takes over the product page.
 * - A report is never attached to a product by guesswork. The title must match
 *   a product outright, or split into a product and a strength that actually
 *   parses. Everything else stays unmatched and lives in the library only,
 *   unless a human says otherwise through `tpc_lab_report_links`.
 *
 * Cost: products are resolved once per request into a name/slug lookup, so 58
 * reports cost one product query, not 58.
 *
 * @package Peptide_Collective_Commerce
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Lab_Reports {

	const CONTRACT     = 1;
	const POST_TYPE    = 'lab-report';
	const ROUTE_NS     = 'tpc/v1';
	const ROUTE        = '/lab-reports';
	const OPTION_LINKS = 'tpc_lab_report_links';
	const MAX_AGE      = 60;

	/* Where the certificate index is kept between requests. A day is only the
	   ceiling: every edit that can change the answer clears it by hand. */
	const COA_CACHE     = 'tpc_coa_product_index';
	const COA_CACHE_TTL = DAY_IN_SECONDS;

	/** Text fields published verbatim, in the order the contract lists them. */
	const TEXT_FIELDS = array( 'purity', 'weight', 'endotoxins', 'sterility', 'heavy_metals' );

	/** Dash characters seen in real titles, plus the rest of the Unicode dash block. */
	const DASHES = array( '-', "\xe2\x80\x93", "\xe2\x80\x94", "\xe2\x80\x92", "\xe2\x80\x95", "\xe2\x88\x92" );

	/** @var array<string, string>|null Normalised product name/slug => storefront key. */
	private static $index = null;

	/** @var array<string, array>|null Storefront key => certificate picture, or null before the first read. */
	private static $coa = null;

	public static function boot(): void {
		add_action( 'rest_api_init', array( self::class, 'register_route' ) );

		// A save of any status, because unpublishing changes the route's answer
		// as much as publishing does. Autosaves and revisions are not edits.
		add_action( 'save_post_' . self::POST_TYPE, array( self::class, 'on_save' ), 10, 2 );
		add_action( 'wp_trash_post', array( self::class, 'on_trash' ), 10, 1 );
		add_action( 'untrashed_post', array( self::class, 'on_trash' ), 10, 1 );

		// The certificate index is keyed by product, so a product edit can
		// invalidate it without any report changing.
		foreach ( array( 'save_post_' . self::POST_TYPE, 'save_post_product', 'wp_trash_post', 'untrashed_post', 'deleted_post' ) as $hook ) {
			add_action( $hook, array( self::class, 'forget_coa_index' ), 10, 0 );
		}
	}

	/* ------------------------------------------------------------------ Route */

	public static function register_route(): void {
		register_rest_route(
			self::ROUTE_NS,
			self::ROUTE,
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( self::class, 'rest_index' ),
				// Public on purpose: these are the numbers already printed on
				// the certificates the shop hands out. The gate allowlist
				// entry in TPC_Gate_Allowlist is what lets an anonymous
				// storefront server actually reach it.
				'permission_callback' => '__return_true',
			)
		);
	}

	/** @return WP_REST_Response */
	public static function rest_index() {
		$response = new WP_REST_Response(
			array(
				'contract'  => self::CONTRACT,
				'generated' => gmdate( 'c' ),
				'reports'   => self::reports(),
			)
		);

		// A minute is long enough to absorb a burst of builds and short enough
		// that a missed webhook is a minute stale, not an hour.
		$response->header( 'Cache-Control', 'public, max-age=' . self::MAX_AGE );

		return $response;
	}

	/* ---------------------------------------------------------------- Reading */

	/**
	 * Every published report, newest first.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function reports(): array {
		$posts = get_posts(
			array(
				'post_type'              => self::POST_TYPE,
				'post_status'            => 'publish',
				'numberposts'            => -1,
				'orderby'                => 'ID',
				'order'                  => 'DESC',
				'suppress_filters'       => false,
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
				// Meta is primed in one query for the whole set, which is what
				// makes the per-report get_field/get_post_meta calls free.
				'update_post_meta_cache' => true,
			)
		);

		$index     = self::product_index();
		$overrides = self::overrides();
		$reports   = array();

		foreach ( $posts as $post ) {
			$reports[] = self::report( $post, $index, $overrides );
		}

		usort( $reports, array( self::class, 'compare' ) );

		return $reports;
	}

	/**
	 * One report in contract 9.1 shape.
	 *
	 * @param WP_Post               $post
	 * @param array<string, string> $index     Normalised product name/slug => key.
	 * @param array<int, string>    $overrides Report id => key.
	 * @return array<string, mixed>
	 */
	private static function report( WP_Post $post, array $index, array $overrides ): array {
		$id    = (int) $post->ID;
		// Decoded once here so the storefront prints 'GLP-3/R - 40 MG' rather
		// than the entity WordPress stores it with.
		$title = trim( html_entity_decode( (string) get_the_title( $post ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		$link  = self::resolve( $id, $title, $index, $overrides );

		$report = array(
			'id'    => $id,
			'title' => $title,
			'lot'   => self::text( self::field( $id, 'batch' ) ),
			'date'  => self::iso_date( self::field( $id, 'date' ) ),
		);

		foreach ( self::TEXT_FIELDS as $field ) {
			$report[ $field ] = self::text( self::field( $id, $field ) );
		}

		$report['report']      = self::file_url( self::field( $id, 'report_coa_in_pdf' ) );
		$report['previous']    = self::previous( $id );
		$report['product_key'] = $link['product_key'];
		$report['strength']    = $link['strength'];
		$report['link']        = $link['link'];

		return $report;
	}

	/**
	 * Newest first by date, then by id.
	 *
	 * A report with no usable date sorts last rather than first: an unparseable
	 * field should not promote a lot to the top of a product page.
	 *
	 * @param array<string, mixed> $a
	 * @param array<string, mixed> $b
	 */
	private static function compare( array $a, array $b ): int {
		$date_a = (string) $a['date'];
		$date_b = (string) $b['date'];

		if ( $date_a !== $date_b ) {
			if ( '' === $date_a ) {
				return 1;
			}
			if ( '' === $date_b ) {
				return -1;
			}
			return strcmp( $date_b, $date_a );
		}

		return (int) $b['id'] <=> (int) $a['id'];
	}

	/**
	 * ACF when it is active, the raw meta when it is not.
	 *
	 * ACF writes each field to post meta under its own name, so the route keeps
	 * answering if the plugin is deactivated. What changes is the shape: a file
	 * field comes back as an array from `get_field` and as an attachment id
	 * from meta, and a date comes back formatted from `get_field` and as `Ymd`
	 * from meta. Both readers below handle both.
	 *
	 * @return mixed
	 */
	private static function field( int $post_id, string $name ) {
		/*
		 * The date is read raw, and only the date.
		 *
		 * This field holds `d/m/Y` in post meta, which is not the `Ymd` an ACF
		 * date picker normally saves. `get_field()` therefore reformats it as
		 * though it were `m/d/Y`: `05/08/2026` comes back as `08/05/2026`, and
		 * `20/07/2026`, where the swap is impossible, comes back as today's
		 * date. Measured on this site: 52 of 58 reports altered, 26 of them to
		 * today. A certificate dated today because a format was misread is the
		 * worst kind of wrong, because it sorts to the top and takes over the
		 * product page. The stored value is correct, so it is used as stored.
		 */
		if ( 'date' === $name ) {
			$raw = get_post_meta( $post_id, $name, true );
			if ( is_string( $raw ) && '' !== trim( $raw ) ) {
				return $raw;
			}
		}

		if ( function_exists( 'get_field' ) ) {
			return get_field( $name, $post_id );
		}

		return get_post_meta( $post_id, $name, true );
	}

	/**
	 * A scalar field as a trimmed string. Anything else is empty, never guessed.
	 *
	 * @param mixed $value
	 */
	private static function text( $value ): string {
		if ( is_array( $value ) || is_object( $value ) || null === $value || is_bool( $value ) ) {
			return '';
		}

		return trim( (string) $value );
	}

	/**
	 * The certificate PDF as a URL.
	 *
	 * @param mixed $value ACF file array, an attachment id, or a bare URL.
	 */
	private static function file_url( $value ): string {
		if ( is_array( $value ) ) {
			$url = isset( $value['url'] ) ? trim( (string) $value['url'] ) : '';
			return '' !== $url ? esc_url_raw( $url ) : '';
		}

		if ( is_numeric( $value ) ) {
			$url = wp_get_attachment_url( (int) $value );
			return is_string( $url ) ? $url : '';
		}

		$url = self::text( $value );

		return '' !== $url ? esc_url_raw( $url ) : '';
	}

	/**
	 * The "previous batch" link, or null when the report names none.
	 *
	 * The label is built here rather than on the storefront because the two
	 * fields are only meaningful together; a href with no lot number is a link
	 * with nothing to say.
	 *
	 * @return array{label:string, href:string}|null
	 */
	private static function previous( int $post_id ): ?array {
		$lot  = self::text( self::field( $post_id, 'previous_batch' ) );
		$href = self::text( self::field( $post_id, 'previous_batch_url' ) );

		if ( '' === $lot && '' === $href ) {
			return null;
		}

		return array(
			'label' => '' !== $lot ? 'Previous batch: ' . $lot : 'Previous batch',
			'href'  => '' !== $href ? esc_url_raw( $href ) : '',
		);
	}

	/* ---------------------------------------------------------------- Linking */

	/**
	 * Contract 9.2: override, then exact, then derived, then unmatched.
	 *
	 * The strength is read off the title independently of how the product was
	 * found, so a title that carries one still publishes it even when the whole
	 * title happened to match a product outright.
	 *
	 * @param array<string, string> $index
	 * @param array<int, string>    $overrides
	 * @return array{product_key:?string, strength:string, link:string}
	 */
	public static function resolve( int $post_id, string $title, array $index, array $overrides ): array {
		$parts    = self::split_title( $title );
		$strength = self::parse_strength( $parts['strength'] );

		// A human has said where this report belongs. That beats both rules,
		// and it is reported as `exact` because nothing was inferred.
		if ( isset( $overrides[ $post_id ] ) && '' !== $overrides[ $post_id ] ) {
			return array(
				'product_key' => $overrides[ $post_id ],
				'strength'    => $strength,
				'link'        => 'exact',
			);
		}

		$norm_lr = self::normalise( $title );

		/*
		 * Longest product name first.
		 *
		 * The rule below is a prefix test, so one report can satisfy more than
		 * one product. WordPress never has to choose, because it asks the
		 * question once per product page. Publishing one key per report means
		 * choosing, and the most specific name is the right answer.
		 */
		$candidates = $index;
		uksort(
			$candidates,
			static function ( $a, $b ): int {
				return strlen( (string) $b ) <=> strlen( (string) $a );
			}
		);

		foreach ( $candidates as $norm_product => $key ) {
			$norm_product = (string) $norm_product;
			if ( '' === $norm_product || ! self::titles_match( $norm_product, $norm_lr ) ) {
				continue;
			}

			return array(
				'product_key' => $key,
				'strength'    => $strength,
				'link'        => $norm_product === $norm_lr ? 'exact' : 'derived',
			);
		}

		return array(
			'product_key' => null,
			'strength'    => $strength,
			'link'        => 'unmatched',
		);
	}

	/**
	 * Does this lab report belong to this product?
	 *
	 * A faithful port of `pc_titles_match()` in the shop's own
	 * `PC Lab Report Query Filter` plugin, which is how WordPress decides what
	 * to show under a product today. Deliberately not improved: the storefront
	 * has to list the same certificates the shop already lists, and a stricter
	 * rule here would quietly show fewer of them.
	 *
	 * Two behaviours are load bearing. It is a prefix test rather than a split
	 * on a separator, so `GHRP-2 10mg` belongs to `GHRP-2` with no dash between
	 * them. And a blend is never confused with a single in either direction,
	 * without which `BPC-157` would claim `BPC-157 + TB 500 - 20MG`, because
	 * the one name really is a prefix of the other title.
	 *
	 * @param string $norm_product Normalised product name.
	 * @param string $norm_lr      Normalised lab report title.
	 */
	public static function titles_match( string $norm_product, string $norm_lr ): bool {
		if ( $norm_product === $norm_lr ) {
			return true;
		}

		if ( self::is_combined( $norm_product ) ) {
			if ( ! self::is_combined( $norm_lr ) ) {
				return false;
			}

			$lr_base = self::strip_mg_suffix( $norm_lr );
			if ( $norm_product === $lr_base ) {
				return true;
			}

			if ( strlen( $norm_product ) >= 3 && 0 === strpos( $norm_lr, $norm_product ) ) {
				$next = strlen( $norm_product );
				if ( $next >= strlen( $norm_lr ) ) {
					return true;
				}
				if ( ' ' === $norm_lr[ $next ] || '-' === $norm_lr[ $next ] ) {
					return true;
				}
			}

			return self::strip_mg_suffix( $norm_product ) === $lr_base;
		}

		if ( self::is_combined( $norm_lr ) ) {
			return false;
		}

		return strlen( $norm_product ) >= 3 && 0 === strpos( $norm_lr, $norm_product );
	}

	/** A blend, as the shop's own filter recognises one. */
	public static function is_combined( string $normalised ): bool {
		return false !== strpos( $normalised, '+' );
	}

	/** Drop a trailing ` - 10mg`, the way the shop's filter does. */
	public static function strip_mg_suffix( string $normalised ): string {
		return trim( (string) preg_replace( '/\s*-\s*\d+\s*mg\s*$/i', '', $normalised ) );
	}

	/**
	 * Lower case, one kind of dash, one kind of space.
	 *
	 * Titles and product names disagree about all three: `GHK-Cu - 100MG`,
	 * `AHK-Cu -100 MG`, `Epithalon - 10MG` with an en dash. Comparing raw
	 * strings would miss matches that are plainly the same product.
	 */
	public static function normalise( string $value ): string {
		/* Entities first, or the dash rule below never sees a dash.
		   `wptexturize` turns the hyphen an editor typed into an en dash, and
		   `get_the_title()` hands it back as `&#8211;`. Matching on the raw
		   string left 36 of 58 reports unmatched because their separator was
		   six characters of HTML rather than one dash. */
		$value = html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$value = function_exists( 'mb_strtolower' ) ? mb_strtolower( trim( $value ) ) : strtolower( trim( $value ) );
		$value = (string) preg_replace( '/[\x{2010}-\x{2015}\x{2212}]/u', '-', $value );

		/* The last two mirror `pc_normalize_title()` exactly. They are what make
		   `GLP-3 / R` and `GLP-3/R` the same product, and what turns
		   `Selank+Semax` into `selank + semax` so it can match the product of
		   that name. Dropping either one silently loses matches. */
		$value = (string) preg_replace( '/\s*\/\s*/', '/', $value );
		$value = (string) preg_replace( '/\s*\+\s*/', ' + ', $value );
		$value = (string) preg_replace( '/[\s\x{00A0}]+/u', ' ', $value );

		return trim( $value );
	}

	/**
	 * Split a title on its last dash.
	 *
	 * The last one, not the first: `GHK-Cu - 100MG` and `MOTS-c - 40 MG` both
	 * carry a dash inside the product name. A leading dash is not a separator.
	 *
	 * @return array{name:string, strength:string}
	 */
	public static function split_title( string $title ): array {
		// Same reason as normalise(): the separator can arrive as `&#8211;`.
		$title = trim( html_entity_decode( $title, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		$cut   = -1;
		$width = 0;

		foreach ( self::DASHES as $dash ) {
			$at = strrpos( $title, $dash );
			if ( false !== $at && $at > $cut ) {
				$cut   = $at;
				$width = strlen( $dash );
			}
		}

		if ( $cut < 1 ) {
			return array(
				'name'     => $title,
				'strength' => '',
			);
		}

		return array(
			'name'     => trim( substr( $title, 0, $cut ) ),
			'strength' => trim( substr( $title, $cut + $width ) ),
		);
	}

	/**
	 * A strength is a number and a unit, and is published exactly as written.
	 *
	 * Reformatting `10MG` to `10 MG` would make the storefront's strength stop
	 * matching the one on the pack render, so the only job here is to decide
	 * whether the right-hand side is a strength at all.
	 */
	public static function parse_strength( string $value ): string {
		$value = trim( (string) preg_replace( '/[\s\x{00A0}]+/u', ' ', $value ) );
		if ( '' === $value ) {
			return '';
		}

		return preg_match( '/^[0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|ug|\x{00B5}g|g|iu|ml)$/iu', $value ) ? $value : '';
	}

	/**
	 * ACF `d/m/Y` to ISO `Y-m-d`, or "".
	 *
	 * The round trip is the check: `createFromFormat` happily reads `31/31/2026`
	 * and rolls it over into a real date, and formatting it back is what catches
	 * that. `Ymd` is here because that is what ACF's date picker writes to meta,
	 * which is what this route reads when ACF is deactivated.
	 *
	 * @param mixed $value
	 */
	public static function iso_date( $value ): string {
		if ( is_array( $value ) || is_object( $value ) ) {
			return '';
		}

		$raw = trim( (string) $value );
		if ( '' === $raw ) {
			return '';
		}

		foreach ( array( 'd/m/Y', 'Y-m-d', 'Ymd' ) as $format ) {
			$date = DateTimeImmutable::createFromFormat( $format, $raw );
			if ( $date instanceof DateTimeImmutable && $date->format( $format ) === $raw ) {
				return $date->format( 'Y-m-d' );
			}
		}

		return '';
	}

	/* --------------------------------------------------------------- Products */

	/**
	 * Every published product's name and slug, mapped to its storefront key.
	 *
	 * Built once per request and kept, because the alternative is
	 * `wc_get_product` inside a loop over 58 reports. The first product to
	 * claim a name keeps it; two products with the same name is a catalogue
	 * problem, and picking the later one at random would not fix it.
	 *
	 * @return array<string, string>
	 */
	public static function product_index(): array {
		if ( null !== self::$index ) {
			return self::$index;
		}

		self::$index = array();

		if ( ! function_exists( 'wc_get_products' ) || ! class_exists( 'TPC_Product_Contract' ) ) {
			return self::$index;
		}

		$products = wc_get_products(
			array(
				'status' => 'publish',
				'type'   => array( 'simple', 'variable' ),
				'limit'  => -1,
			)
		);

		foreach ( is_array( $products ) ? $products : array() as $product ) {
			if ( ! $product instanceof WC_Product ) {
				continue;
			}

			$key = TPC_Product_Contract::key_for( $product );
			if ( '' === $key ) {
				continue;
			}

			foreach ( array( $product->get_name(), $product->get_slug() ) as $candidate ) {
				$normalised = self::normalise( (string) $candidate );
				if ( '' !== $normalised && ! isset( self::$index[ $normalised ] ) ) {
					self::$index[ $normalised ] = $key;
				}
			}
		}

		return self::$index;
	}

	/** Drop the request-level memo, for tests and long-running CLI loops. */
	public static function reset(): void {
		self::$index = null;
		self::$coa   = null;
	}

	/* ------------------------------------------------------- Certificate picture */

	/**
	 * The certificate a product page shows beside the vial, and the purity on it.
	 *
	 * The live theme appends this to the WooCommerce gallery as a second image
	 * (`tpc_pdp_gallery_add_coa` in tpc-storefront/functions.php), so it is
	 * there for every strength rather than only the one whose lot happens to be
	 * newest. The storefront could not read it from the Store API, because that
	 * filter returns early off `is_product()` and the gallery is empty in REST;
	 * so the rule is reproduced here and published on the contract instead.
	 *
	 * Four rules, all the theme's:
	 *
	 * - the report is the newest by post date, not by the analysis date, which
	 *   is the order `get_posts` returns and `tpc_coa_current_report_id` keeps;
	 * - a report with no batch is a stub and is passed over, not accepted empty;
	 * - the picture is the certificate PDF's generated first page, never the
	 *   `report_image_*` slots, which carry another product's scan on most of
	 *   the catalogue;
	 * - the shared "COA coming soon" placeholder is not a certificate.
	 *
	 * @return array{image:string, width:int, height:int, purity:string, lot:string}
	 */
	public static function coa_for( string $key ): array {
		if ( null === self::$coa ) {
			/*
			 * Kept between requests, not just within one.
			 *
			 * The Store API asks for `extensions.tpc` once per product, so the
			 * memo below already stops a 43-product list rebuilding this 43
			 * times. What it does not stop is every *request* paying for it,
			 * and the build is 84 queries and about 210ms: it reads every lab
			 * report's meta and asks each certificate PDF for its preview
			 * size. On a shop whose whole catalogue is one anonymous Store API
			 * call, that lands on the storefront's revalidation and on every
			 * native page WooCommerce serves. Nothing here changes except when
			 * a report or a product is edited, and both clear this by hand.
			 */
			$cached    = get_transient( self::COA_CACHE );
			self::$coa = is_array( $cached ) ? $cached : self::build_coa_index();

			if ( ! is_array( $cached ) ) {
				set_transient( self::COA_CACHE, self::$coa, self::COA_CACHE_TTL );
			}
		}

		return self::$coa[ $key ] ?? self::no_coa();
	}

	/**
	 * Forget the certificate index.
	 *
	 * Called for a lab report, whose fields it reads, and for a product, whose
	 * name it matches those reports against - a rename moves certificates
	 * between products as surely as editing one does.
	 */
	public static function forget_coa_index(): void {
		self::$coa = null;
		delete_transient( self::COA_CACHE );
	}

	/** @return array{image:string, width:int, height:int, purity:string, lot:string} */
	private static function no_coa(): array {
		return array(
			'image'  => '',
			'width'  => 0,
			'height' => 0,
			'purity' => '',
			'lot'    => '',
		);
	}

	/**
	 * Every product's certificate picture, in one pass over the reports.
	 *
	 * Built for the whole catalogue at once because the Store API asks for
	 * `extensions.tpc` once per product, and resolving 58 reports 43 times over
	 * would turn a list request into a minute of database work.
	 *
	 * @return array<string, array{image:string, width:int, height:int, purity:string, lot:string}>
	 */
	private static function build_coa_index(): array {
		$posts = get_posts(
			array(
				'post_type'              => self::POST_TYPE,
				'post_status'            => 'publish',
				'numberposts'            => -1,
				// Post date, descending: the theme's definition of "current".
				'orderby'                => 'date',
				'order'                  => 'DESC',
				'suppress_filters'       => false,
				'no_found_rows'          => true,
				'update_post_term_cache' => false,
				'update_post_meta_cache' => true,
			)
		);

		$index     = self::product_index();
		$overrides = self::overrides();
		$coa       = array();

		foreach ( $posts as $post ) {
			$id    = (int) $post->ID;
			$title = trim( html_entity_decode( (string) get_the_title( $post ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
			$key   = self::resolve( $id, $title, $index, $overrides )['product_key'];

			// The first report to claim a key is the newest one; a later report
			// is an older lot and has nothing to add.
			if ( null === $key || isset( $coa[ $key ] ) ) {
				continue;
			}

			$lot = self::text( self::field( $id, 'batch' ) );
			if ( '' === $lot ) {
				continue;
			}

			$pdf = self::attachment_id( self::field( $id, 'report_coa_in_pdf' ) );
			if ( 0 === $pdf ) {
				$pdf = self::attachment_id( self::field( $id, 'report_pdf' ) );
			}
			if ( 0 === $pdf ) {
				continue;
			}

			$file = basename( (string) wp_get_attachment_url( $pdf ) );
			if ( preg_match( '/coming[\s_-]*soon/i', $file ) ) {
				continue;
			}

			// A PDF only has a preview when the server rendered one on upload.
			// Where it did not, the product simply keeps one image, which is
			// what the theme does too.
			$src = wp_get_attachment_image_src( $pdf, 'large' );
			if ( ! is_array( $src ) || empty( $src[0] ) ) {
				continue;
			}

			$coa[ $key ] = array(
				'image'  => esc_url_raw( (string) $src[0] ),
				'width'  => isset( $src[1] ) ? (int) $src[1] : 0,
				'height' => isset( $src[2] ) ? (int) $src[2] : 0,
				'purity' => self::percentage( self::text( self::field( $id, 'purity' ) ) ),
				'lot'    => $lot,
			);
		}

		return $coa;
	}

	/**
	 * An attachment id out of a field that has been stored three ways.
	 *
	 * `report_coa_in_pdf` holds a bare id on most reports, an ACF array on
	 * some, and a plain URL on a few, which is why this looks at all three
	 * rather than casting and hoping.
	 *
	 * @param mixed $value
	 */
	private static function attachment_id( $value ): int {
		if ( is_array( $value ) ) {
			foreach ( array( 'ID', 'id' ) as $field ) {
				if ( isset( $value[ $field ] ) ) {
					return (int) $value[ $field ];
				}
			}
			$value = reset( $value );
		}

		if ( is_numeric( $value ) ) {
			return (int) $value;
		}

		if ( is_string( $value ) && '' !== trim( $value ) ) {
			return (int) attachment_url_to_postid( trim( $value ) );
		}

		return 0;
	}

	/** `"99.91% AVG"` -> `"99.91%"`. A report with no reading publishes "". */
	private static function percentage( string $value ): string {
		return preg_match( '/[\d.]+\s*%/', $value, $match ) ? trim( $match[0] ) : '';
	}

	/**
	 * The human override map, `{"<report id>": "<key>"}`.
	 *
	 * @return array<int, string>
	 */
	public static function overrides(): array {
		$stored = get_option( self::OPTION_LINKS, null );
		if ( is_string( $stored ) && '' !== $stored ) {
			$decoded = json_decode( $stored, true );
			$stored  = is_array( $decoded ) ? $decoded : null;
		}

		$clean = array();
		foreach ( is_array( $stored ) ? $stored : array() as $id => $key ) {
			$id  = (int) $id;
			$key = sanitize_title( (string) $key );
			if ( $id > 0 && '' !== $key ) {
				$clean[ $id ] = $key;
			}
		}

		return $clean;
	}

	/** The storefront key one report resolves to, or null. */
	public static function key_for_post( int $post_id ): ?string {
		$title    = trim( (string) get_the_title( $post_id ) );
		$resolved = self::resolve( $post_id, $title, self::product_index(), self::overrides() );

		return $resolved['product_key'];
	}

	/**
	 * Every published report as ids, for the CLI.
	 *
	 * @return array<int, int>
	 */
	public static function report_ids(): array {
		$ids = get_posts(
			array(
				'post_type'        => self::POST_TYPE,
				'post_status'      => 'publish',
				'numberposts'      => -1,
				'orderby'          => 'ID',
				'order'            => 'DESC',
				'fields'           => 'ids',
				'suppress_filters' => false,
				'no_found_rows'    => true,
			)
		);

		return array_map( 'intval', is_array( $ids ) ? $ids : array() );
	}

	/* ---------------------------------------------------------- Invalidation */

	/**
	 * @param int|string $post_id
	 * @param mixed      $post
	 */
	public static function on_save( $post_id, $post = null ): void {
		$post_id = (int) $post_id;

		// An autosave and a revision are copies of the post, not the post, and
		// neither changes what the route answers.
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		self::queue( $post_id );
	}

	/** @param int|string $post_id */
	public static function on_trash( $post_id ): void {
		$post_id = (int) $post_id;

		if ( self::POST_TYPE === get_post_type( $post_id ) ) {
			self::queue( $post_id );
		}
	}

	/**
	 * Hand the report to the existing revalidation queue.
	 *
	 * Topic `tpc.report` rather than `tpc.product` because the storefront has
	 * to expire `public:reports` as well, which an ordinary stock change must
	 * not do. Same queue, same signing, same dedupe, same single retry.
	 */
	private static function queue( int $post_id ): void {
		if ( $post_id < 1 || ! class_exists( 'TPC_Storefront_Revalidation' ) ) {
			return;
		}

		TPC_Storefront_Revalidation::queue_report( $post_id, self::key_for_post( $post_id ) );
	}

	/* ------------------------------------------------------------------- CLI */

	/**
	 * `wp tpc-commerce reports [--id=<id>]`, called from TPC_Commerce_CLI so
	 * everything that knows about lab reports stays in this file.
	 *
	 * @param array<string, mixed> $assoc_args
	 */
	public static function cli_reports( array $assoc_args ): void {
		$config = TPC_Storefront_Revalidation::config();
		if ( '' === $config['url'] ) {
			WP_CLI::error( 'No storefront origin. Set one in WooCommerce -> Headless Core, or in this plugin\'s settings. Nothing sent.' );
		}
		if ( '' === $config['secret'] ) {
			WP_CLI::error( 'tpc_storefront_webhook_secret is empty. Nothing sent.' );
		}

		if ( isset( $assoc_args['id'] ) ) {
			$id = (int) $assoc_args['id'];
			if ( $id < 1 || self::POST_TYPE !== get_post_type( $id ) ) {
				WP_CLI::error( 'Post ' . $id . ' is not a ' . self::POST_TYPE . '.' );
			}
			$ids = array( $id );
		} else {
			$ids = self::report_ids();
			if ( ! $ids ) {
				WP_CLI::error( 'No published lab reports.' );
			}
		}

		$sent   = 0;
		$failed = 0;
		foreach ( $ids as $id ) {
			$key    = self::key_for_post( $id );
			$label  = null === $key ? '(unmatched)' : $key;
			$result = TPC_Storefront_Revalidation::send(
				null === $key ? '' : $key,
				$id,
				'save',
				'',
				TPC_Storefront_Revalidation::TOPIC_REPORT
			);

			if ( $result['ok'] ) {
				++$sent;
				WP_CLI::log( sprintf( 'ok    %-32s #%d HTTP %d', $label, $id, $result['status'] ) );
			} else {
				++$failed;
				WP_CLI::warning( sprintf( '%-32s #%d %s', $label, $id, '' !== $result['error'] ? $result['error'] : 'HTTP ' . $result['status'] ) );
			}
		}

		if ( $failed > 0 ) {
			WP_CLI::error( sprintf( '%d sent, %d failed.', $sent, $failed ) );
		}
		WP_CLI::success( sprintf( '%d report%s sent to %s%s.', $sent, 1 === $sent ? '' : 's', $config['url'], TPC_Storefront_Revalidation::PATH ) );
	}
}
