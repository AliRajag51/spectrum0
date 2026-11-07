<?php
/**
 * Bundle & Save - buy more vials of one thing, pay less per vial.
 *
 * The same rule Aminohaus runs, ported here because this site's core does not
 * carry it. It replaces the pack-tier model this plugin shipped with, which was
 * wrong in a way customers could see: a "2 Packs" choice travelled as cart item
 * data, so it opened its own line, multiplied with the quantity stepper, and a
 * shopper who picked two packs and left the stepper on two was charged for four
 * vials as "Thymalin (2-vial pack) x 4" - next to a separate "Thymalin x 1"
 * they had added a moment earlier.
 *
 * Here the tier is a function of the line quantity and nothing else. "2 Packs"
 * is a quantity of two. The stepper is the same number. Adding the same strength
 * again grows the one line. Four vials earn the three-vial rate, because a tier
 * starts at its quantity and holds until the next one begins.
 *
 * The rule lives in WooCommerce, not in the storefront that draws it. A
 * percentage shown on a product page but never applied at checkout is worse
 * than no offer at all. So the discount is applied to the real line item, and
 * flows into the cart, the order totals, the confirmation email and the refund.
 * The storefront reads the same tiers over /wp-json/tpc/v1/bundle-tiers, so the
 * badge and the bill cannot disagree.
 *
 * Tiers are data, not code:
 *   1. the `tpc_bundle_tiers` option  (the admin screen, no code)
 *   2. the defaults below             (a new house rule)
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Bundle_Save {

	const VERSION     = '1.7.2';
	const OPT_TIERS   = 'tpc_bundle_tiers';
	const OPT_ENABLED = 'tpc_bundle_enabled';
	const ROUTE_NS    = 'tpc/v1';
	const ROUTE       = '/bundle-tiers';

	public static function boot(): void {
		add_action( 'rest_api_init', array( self::class, 'register_route' ) );

		// Late, so anything that sets a base price (sales, member pricing) has
		// already run and the percentage comes off the price the customer would
		// otherwise have paid.
		add_action( 'woocommerce_before_calculate_totals', array( self::class, 'apply' ), 25 );

		add_action( 'woocommerce_blocks_loaded', array( self::class, 'register_store_api_data' ) );

		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'admin_post_tpc_bundle_save', array( self::class, 'handle_save' ) );
	}

	/**
	 * One switch for both halves.
	 *
	 * Off means WooCommerce stops discounting *and* the storefront stops
	 * advertising, because the route hands back nothing. Stored as 'yes'/'no'
	 * rather than a boolean: update_option() reads a missing option as false,
	 * so writing false to one that has never been set compares equal to what is
	 * already there and it returns without writing - the first time anybody
	 * switched this off, nothing would happen and the box would come back
	 * ticked. A non-empty string cannot collide with absence.
	 */
	public static function is_on(): bool {
		return 'no' !== get_option( self::OPT_ENABLED, 'yes' );
	}

	/* --------------------------------------------------------------- the rule */

	/**
	 * This shop's tiers, from its own price list. Aminohaus charges 4% and 5%
	 * with a "Save 7%" badge for reasons that are theirs; here 7% is what the
	 * shop has advertised and what the previous pack model charged, so the
	 * badge and the rate agree.
	 *
	 * The offer stops at four. A tier holds until the next one begins, so the
	 * 0% tier at five is what ends it: five vials and up are full price, which
	 * is the rule the shop ran before ({5: 0} in its old tier table) and the
	 * owner's stated intent. A 0% tier is never shown as a choice; it only
	 * marks where the saving ends.
	 */
	public static function defaults(): array {
		return array(
			array( 'min' => 1, 'percent' => 0, 'label' => '1 Pack',  'badge' => '' ),
			array( 'min' => 2, 'percent' => 4, 'label' => '2 Packs', 'badge' => 'Save 4%' ),
			array( 'min' => 3, 'percent' => 7, 'label' => '3 Packs', 'badge' => 'Save 7%' ),
			array( 'min' => 5, 'percent' => 0, 'label' => '5 Packs', 'badge' => '' ),
		);
	}

	/** The tiers, cheapest qualifying quantity first. */
	public static function tiers(): array {
		$stored = get_option( self::OPT_TIERS, array() );
		$tiers  = ( is_array( $stored ) && $stored ) ? $stored : self::defaults();

		$clean = array();
		foreach ( (array) $tiers as $tier ) {
			if ( ! is_array( $tier ) || ! isset( $tier['min'] ) ) {
				continue;
			}

			$min     = max( 1, (int) $tier['min'] );
			$percent = isset( $tier['percent'] ) ? (float) $tier['percent'] : 0.0;

			// A tier that took more than everything, or gave money back, would
			// be a typo rather than an offer.
			if ( $percent < 0 || $percent >= 100 ) {
				continue;
			}

			$clean[ $min ] = array(
				'min'     => $min,
				'percent' => $percent,
				'label'   => isset( $tier['label'] ) ? (string) $tier['label'] : sprintf( '%d Packs', $min ),
				'badge'   => isset( $tier['badge'] ) ? (string) $tier['badge'] : '',
			);
		}

		if ( ! $clean ) {
			return self::defaults();
		}

		ksort( $clean );

		return array_values( $clean );
	}

	/**
	 * The best tier a quantity qualifies for, or null when none applies.
	 *
	 * Highest `min` the quantity reaches, so four vials get the three-vial
	 * rate rather than falling through to nothing.
	 */
	public static function tier_for( int $quantity ): ?array {
		$best = null;

		foreach ( self::tiers() as $tier ) {
			if ( $quantity >= $tier['min'] && ( null === $best || $tier['min'] > $best['min'] ) ) {
				$best = $tier;
			}
		}

		return ( $best && $best['percent'] > 0 ) ? $best : null;
	}

	/* ---------------------------------------------------------------- pricing */

	/**
	 * Re-price each line that qualifies.
	 *
	 * The base is read from a freshly loaded product rather than from the cart
	 * item's own object, which makes this safe to run more than once in a
	 * request - WooCommerce fires this hook several times, and discounting an
	 * already discounted price would compound quietly.
	 *
	 * @param WC_Cart $cart
	 */
	public static function apply( $cart ): void {
		if ( ! self::is_on() ) {
			return;
		}
		if ( is_admin() && ! wp_doing_ajax() ) {
			return;
		}
		if ( ! $cart instanceof WC_Cart ) {
			return;
		}

		foreach ( $cart->get_cart() as $item ) {
			if ( empty( $item['data'] ) || ! $item['data'] instanceof WC_Product ) {
				continue;
			}

			$tier = self::tier_for( (int) $item['quantity'] );
			if ( ! $tier ) {
				continue;
			}

			$source = wc_get_product( $item['data']->get_id() );
			if ( ! $source instanceof WC_Product ) {
				continue;
			}

			$base = (float) $source->get_price( 'edit' );
			if ( $base <= 0 ) {
				continue;
			}

			$item['data']->set_price( round( $base * ( 1 - $tier['percent'] / 100 ), wc_get_price_decimals() ) );
		}
	}

	/* ---------------------------------------------------------------- publish */

	/**
	 * Public on purpose: these are prices, which the shop shows to anyone.
	 * Keeping it unauthenticated lets the storefront render the same numbers it
	 * will be charged without holding the bridge key to do it.
	 */
	public static function register_route(): void {
		register_rest_route(
			self::ROUTE_NS,
			self::ROUTE,
			array(
				'methods'             => WP_REST_Server::READABLE,
				'permission_callback' => '__return_true',
				'callback'            => static function () {
					// Switched off publishes nothing rather than tiers that
					// will not be charged; the storefront hides the block.
					$on = self::is_on();

					$response = rest_ensure_response(
						array(
							'enabled' => $on,
							'tiers'   => $on ? self::tiers() : array(),
						)
					);
					$response->header( 'Cache-Control', 'public, max-age=60' );

					return $response;
				},
			)
		);
	}

	/**
	 * What the storefront reads back off each cart line: the rate applied and
	 * the saving, in minor units. Every key is always present; a stable shape
	 * is cheaper to parse than a sparse one.
	 */
	public static function register_store_api_data(): void {
		if ( ! function_exists( 'woocommerce_store_api_register_endpoint_data' ) ) {
			return;
		}

		woocommerce_store_api_register_endpoint_data(
			array(
				'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema::IDENTIFIER,
				'namespace'       => 'tpc',
				'data_callback'   => array( self::class, 'line_data' ),
				'schema_callback' => array( self::class, 'line_schema' ),
				'schema_type'     => ARRAY_A,
			)
		);
	}

	public static function line_data( $item ): array {
		$quantity = is_array( $item ) && isset( $item['quantity'] ) ? (int) $item['quantity'] : 0;
		$tier     = self::is_on() ? self::tier_for( $quantity ) : null;
		$percent  = $tier ? (float) $tier['percent'] : 0.0;
		$savings  = 0;

		if ( $percent > 0 && isset( $item['data'] ) && $item['data'] instanceof WC_Product ) {
			$source = wc_get_product( $item['data']->get_id() );
			if ( $source instanceof WC_Product ) {
				$base    = (float) $source->get_price( 'edit' );
				$actual  = (float) $item['data']->get_price( 'edit' );
				$savings = (int) round( max( 0, $base - $actual ) * $quantity * pow( 10, wc_get_price_decimals() ) );
			}
		}

		return array(
			'discount_percent' => round( $percent, 2 ),
			'bundle_savings'   => $savings,
		);
	}

	public static function line_schema(): array {
		return array(
			'discount_percent' => array(
				'description' => __( 'Percentage saving applied for the quantity tier.', 'peptide-collective-commerce' ),
				'type'        => 'number',
				'readonly'    => true,
			),
			'bundle_savings'   => array(
				'description' => __( 'Bundle saving in currency minor units, excluding sale and coupon discounts.', 'peptide-collective-commerce' ),
				'type'        => 'integer',
				'readonly'    => true,
			),
		);
	}

	/* ------------------------------------------------------------------ admin */

	/** Top level, not buried under WooCommerce: it is a pricing rule. */
	public static function menu(): void {
		$on = self::is_on();

		add_menu_page(
			'Bundle & Save',
			$on ? 'Bundle &amp; Save' : 'Bundle OFF',
			'manage_woocommerce',
			'tpc-bundle-save',
			array( self::class, 'screen' ),
			$on ? 'dashicons-cart' : 'dashicons-hidden',
			57
		);
	}

	/** A price to show the rule working against, so the effect is concrete. */
	private static function sample_price(): float {
		$ids = function_exists( 'wc_get_products' )
			? wc_get_products( array( 'limit' => 1, 'status' => 'publish', 'return' => 'ids' ) )
			: array();

		if ( $ids ) {
			$product = wc_get_product( $ids[0] );
			$price   = $product ? (float) $product->get_price( 'edit' ) : 0;
			if ( $price > 0 ) {
				return $price;
			}
		}

		return 100.0;
	}

	public static function screen(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Not allowed.', '', array( 'response' => 403 ) );
		}

		$on     = self::is_on();
		$tiers  = self::tiers();
		$stored = get_option( self::OPT_TIERS, null );
		$sample = self::sample_price();
		$rows   = max( 5, count( $tiers ) + 2 );
		$notice = isset( $_GET['tpc'] ) ? sanitize_key( wp_unslash( $_GET['tpc'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		?>
		<div class="wrap">
			<h1>Bundle &amp; Save</h1>

			<?php if ( 'saved' === $notice ) : ?>
				<div class="notice notice-success is-dismissible"><p>Saved. The storefront catches up within the hour, or on its next product update.</p></div>
			<?php elseif ( 'reset' === $notice ) : ?>
				<div class="notice notice-success is-dismissible"><p>Back to the built-in tiers.</p></div>
			<?php elseif ( 'empty' === $notice ) : ?>
				<div class="notice notice-error is-dismissible"><p>No usable tiers in that - nothing was changed. Every tier needs a quantity, and a discount from 0 up to (not including) 100.</p></div>
			<?php endif; ?>

			<p style="max-width:70ch">
				Buy more of one product, pay less per vial. The discount is applied by
				WooCommerce to the real line item, so it reaches the cart, the order,
				the confirmation email and any refund - not just the product page.
			</p>

			<p style="padding:12px 16px;background:#fff;border:1px solid <?php echo $on ? '#2f8659' : '#b4423a'; ?>;max-width:70ch">
				<strong><?php echo $on ? 'Bundle pricing is ON.' : 'Bundle pricing is OFF.'; ?></strong><br>
				<?php if ( $on ) : ?>
					Every qualifying cart is discounted, whether or not the storefront
					shows these tiers.
				<?php else : ?>
					Nothing is discounted and the storefront is told there are no tiers,
					so it shows no bundle options.
				<?php endif; ?>
			</p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="tpc_bundle_save">
				<?php wp_nonce_field( 'tpc_bundle_save' ); ?>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">Bundle pricing</th>
						<td>
							<label>
								<input type="checkbox" name="enabled" value="1" <?php checked( $on ); ?>>
								Discount carts that qualify
							</label>
						</td>
					</tr>
				</table>

				<h2>Tiers</h2>
				<p class="description" style="max-width:70ch">
					A tier starts at its quantity and holds until the next one begins. The
					last one is open ended, so to stop the offer at a quantity add a 0%
					tier there: the built-in 0% at five is why four vials get the three
					rate and five do not. A 0% tier is never shown as a choice on the
					storefront. Leave a quantity blank to drop that row. The badge is free text.
				</p>

				<table class="widefat striped" style="max-width:860px;margin:12px 0">
					<thead>
						<tr>
							<th style="width:9em">Quantity (from)</th>
							<th style="width:8em">Discount %</th>
							<th>Label</th>
							<th>Badge</th>
							<th style="width:14em">On <?php echo wp_kses_post( wc_price( $sample ) ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php for ( $i = 0; $i < $rows; $i++ ) :
							$tier    = isset( $tiers[ $i ] ) ? $tiers[ $i ] : null;
							$min     = $tier ? (int) $tier['min'] : '';
							$percent = $tier ? (float) $tier['percent'] : '';
							$each    = $tier ? $sample * ( 1 - $tier['percent'] / 100 ) : 0;
							?>
							<tr>
								<td><input type="number" min="1" step="1" name="tier[<?php echo (int) $i; ?>][min]" value="<?php echo esc_attr( $min ); ?>" class="small-text"></td>
								<td><input type="number" min="0" max="99.9" step="0.1" name="tier[<?php echo (int) $i; ?>][percent]" value="<?php echo esc_attr( $percent ); ?>" class="small-text"></td>
								<td><input type="text" name="tier[<?php echo (int) $i; ?>][label]" value="<?php echo esc_attr( $tier ? $tier['label'] : '' ); ?>" class="regular-text" placeholder="3 Packs"></td>
								<td><input type="text" name="tier[<?php echo (int) $i; ?>][badge]" value="<?php echo esc_attr( $tier ? $tier['badge'] : '' ); ?>" class="regular-text" placeholder="Save 7%"></td>
								<td>
									<?php if ( $tier ) : ?>
										<?php echo wp_kses_post( wc_price( $each ) ); ?> each<br>
										<span style="color:#666"><?php echo wp_kses_post( wc_price( $each * $tier['min'] ) ); ?> for <?php echo (int) $tier['min']; ?></span>
									<?php endif; ?>
								</td>
							</tr>
						<?php endfor; ?>
					</tbody>
				</table>

				<p>
					<?php submit_button( 'Save changes', 'primary', 'submit', false ); ?>
					&nbsp;
					<?php submit_button( 'Reset to built-in tiers', 'secondary', 'reset', false ); ?>
				</p>

				<p class="description">
					<?php if ( is_array( $stored ) && $stored ) : ?>
						These are your saved tiers. They override the ones built into the
						plugin - reset to go back to those.
					<?php else : ?>
						Currently using the tiers built into the plugin. Saving here
						creates an override that takes precedence from then on.
					<?php endif; ?>
				</p>
			</form>
		</div>
		<?php
	}

	/** A state change, so it is a POST behind a nonce and a capability check. */
	public static function handle_save(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Not allowed.', '', array( 'response' => 403 ) );
		}

		check_admin_referer( 'tpc_bundle_save' );

		$back = admin_url( 'admin.php?page=tpc-bundle-save' );

		if ( isset( $_POST['reset'] ) ) {
			delete_option( self::OPT_TIERS );
			update_option( self::OPT_ENABLED, empty( $_POST['enabled'] ) ? 'no' : 'yes' );
			self::notify_storefront();

			wp_safe_redirect( add_query_arg( 'tpc', 'reset', $back ) );
			exit;
		}

		$submitted = isset( $_POST['tier'] ) && is_array( $_POST['tier'] ) ? wp_unslash( $_POST['tier'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$clean     = array();

		foreach ( $submitted as $row ) {
			if ( ! is_array( $row ) || '' === trim( (string) ( $row['min'] ?? '' ) ) ) {
				continue;
			}

			$min     = (int) $row['min'];
			$percent = (float) ( $row['percent'] ?? 0 );

			if ( $min < 1 || $percent < 0 || $percent >= 100 ) {
				continue;
			}

			$clean[] = array(
				'min'     => $min,
				'percent' => $percent,
				'label'   => sanitize_text_field( (string) ( $row['label'] ?? '' ) ) ?: sprintf( '%d Packs', $min ),
				'badge'   => sanitize_text_field( (string) ( $row['badge'] ?? '' ) ),
			);
		}

		// Refuse to save nothing. An empty table would silently fall back to
		// the built-in tiers, which looks identical to "my edit did not take".
		if ( ! $clean ) {
			wp_safe_redirect( add_query_arg( 'tpc', 'empty', $back ) );
			exit;
		}

		update_option( self::OPT_TIERS, $clean );
		update_option( self::OPT_ENABLED, empty( $_POST['enabled'] ) ? 'no' : 'yes' );
		self::notify_storefront();

		wp_safe_redirect( add_query_arg( 'tpc', 'saved', $back ) );
		exit;
	}

	/**
	 * The storefront caches the tiers under the same tag as its catalogue, and
	 * every `tpc.product` delivery expires that tag. So a tier change rides the
	 * webhook a product edit rides, queued against the first product the shop
	 * lists, rather than adding a second notification path for one setting.
	 */
	private static function notify_storefront(): void {
		if ( ! class_exists( 'TPC_Storefront_Revalidation' ) ) {
			return;
		}
		$ids = TPC_Storefront_Revalidation::catalogue_ids();
		if ( $ids ) {
			TPC_Storefront_Revalidation::queue( (int) $ids[0], 'bundle-tiers' );
		}
	}
}
