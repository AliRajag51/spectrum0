<?php
/** WordPress settings for the shared headless core. */

defined( 'ABSPATH' ) || exit;

final class NVM_Bridge_Admin {
	const PAGE      = 'nvm-headless-core';
	const CAP       = 'manage_woocommerce';
	const OPT_EXTRA = 'nvm_bridge_extra_origins';
	const NOTICE    = 'nvm_bridge_admin_notice';

	public static function boot(): void {
		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'admin_notices', array( self::class, 'configuration_notice' ) );
		add_action( 'admin_post_nvm_bridge_save', array( self::class, 'save' ) );
		add_action( 'admin_post_nvm_bridge_rotate', array( self::class, 'rotate' ) );
		add_filter( 'nvm_bridge_frontend_urls', array( self::class, 'allowed_origins' ) );
	}

	public static function configuration_notice(): void {
		if ( ! current_user_can( self::CAP ) || ! NVM_Headless_Bridge::is_enabled() ) return;
		if ( NVM_Headless_Bridge::production_origin_ready() ) return;

		echo '<div class="notice notice-error"><p><strong>NVM Headless Core:</strong> configure a dedicated HTTPS production storefront before sending customer traffic. Localhost, plain HTTP, and the WordPress host itself are not valid production fallbacks.</p></div>';
	}

	public static function menu(): void {
		$parent = class_exists( 'WooCommerce' ) ? 'woocommerce' : 'options-general.php';

		add_submenu_page(
			$parent,
			'Headless Core',
			'Headless Core',
			self::CAP,
			self::PAGE,
			array( self::class, 'render' )
		);
	}

	public static function allowed_origins( $origins ): array {
		$origins = is_array( $origins ) ? $origins : array();
		$extra   = get_option( self::OPT_EXTRA, array() );

		return array_merge( $origins, is_array( $extra ) ? $extra : array() );
	}

	private static function guard( string $action ): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die(
				esc_html__( 'You cannot change the headless storefront settings.', 'nvm-headless-bridge' ),
				'',
				array( 'response' => 403 )
			);
		}

		check_admin_referer( 'nvm_bridge_' . $action );
	}

	private static function origin( $raw ): string {
		$parts = wp_parse_url( trim( (string) $raw ) );

		if ( ! is_array( $parts ) ) return '';

		$scheme = strtolower( (string) ( $parts['scheme'] ?? '' ) );
		$host   = strtolower( (string) ( $parts['host'] ?? '' ) );

		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || '' === $host ) return '';

		$default = 'https' === $scheme ? 443 : 80;
		$port    = (int) ( $parts['port'] ?? $default );

		return $scheme . '://' . $host . ( $port === $default ? '' : ':' . $port );
	}

	private static function back( string $kind, string $message ): void {
		set_transient(
			self::NOTICE . '_' . get_current_user_id(),
			array( 'kind' => $kind, 'message' => $message ),
			60
		);

		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE ) );
		exit;
	}

	public static function save(): void {
		self::guard( 'save' );

		$target_raw = wp_unslash( $_POST['frontend_url'] ?? '' );
		$target     = '' === trim( (string) $target_raw ) ? '' : self::origin( $target_raw );

		if ( '' !== trim( (string) $target_raw ) && '' === $target ) {
			self::back( 'error', 'The production storefront must be a complete HTTP or HTTPS origin.' );
		}

		if ( '' !== $target && ! str_starts_with( $target, 'https://' ) ) {
			self::back( 'error', 'The production storefront must use HTTPS. Put local HTTP origins in Additional allowed origins.' );
		}

		if ( '' !== $target && strtolower( (string) wp_parse_url( $target, PHP_URL_HOST ) ) === strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) ) {
			self::back( 'error', 'The production storefront must use its dedicated Next.js host, not the WordPress host.' );
		}

		$extra    = array();
		$rejected = array();

		foreach ( preg_split( '/[\r\n]+/', (string) wp_unslash( $_POST['extra_origins'] ?? '' ) ) as $line ) {
			$line = trim( $line );
			if ( '' === $line ) continue;

			$origin = self::origin( $line );
			if ( '' === $origin ) {
				$rejected[] = $line;
			} else {
				$extra[] = $origin;
			}
		}

		if ( $rejected ) {
			self::back( 'error', 'These allowed origins are invalid: ' . implode( ', ', $rejected ) );
		}

		$receipt_defaults = NVM_Headless_Bridge::receipt_action_defaults();
		$receipt           = array(
			'primary_label'   => sanitize_text_field( (string) wp_unslash( $_POST['receipt_primary_label'] ?? '' ) ),
			'primary_path'    => (string) wp_unslash( $_POST['receipt_primary_path'] ?? '' ),
			'secondary_label' => sanitize_text_field( (string) wp_unslash( $_POST['receipt_secondary_label'] ?? '' ) ),
			'secondary_path'  => (string) wp_unslash( $_POST['receipt_secondary_path'] ?? '' ),
		);

		foreach ( array( 'primary_path', 'secondary_path' ) as $path_key ) {
			$raw_path = trim( $receipt[ $path_key ] );
			$safe     = NVM_Headless_Bridge::safe_path( $raw_path );

			if ( '' !== $raw_path && '' === $safe ) {
				self::back( 'error', 'Receipt button links must be storefront-relative paths beginning with one slash.' );
			}

			$receipt[ $path_key ] = '' === $safe ? $receipt_defaults[ $path_key ] : $safe;
		}

		foreach ( array( 'primary_label', 'secondary_label' ) as $label_key ) {
			if ( '' === $receipt[ $label_key ] ) {
				$receipt[ $label_key ] = $receipt_defaults[ $label_key ];
			}
		}

		update_option( NVM_Headless_Bridge::OPT_FRONTEND, $target, false );
		update_option( self::OPT_EXTRA, array_values( array_unique( $extra ) ), false );
		update_option( NVM_Headless_Bridge::OPT_ENABLED, isset( $_POST['enabled'] ) ? 'yes' : 'no', false );
		update_option( NVM_Headless_Bridge::OPT_TRAFFIC_OWNER, isset( $_POST['traffic_owner'] ) ? 'nextjs' : 'wordpress', false );
		update_option( 'nvm_bridge_checkout_skin', isset( $_POST['checkout_skin'] ) ? 'yes' : 'no', false );
		update_option( 'woocommerce_enable_guest_checkout', isset( $_POST['require_account'] ) ? 'no' : 'yes', false );
		update_option( 'nvm_bridge_storefront_login_required', isset( $_POST['require_storefront_login'] ) ? 'yes' : 'no', false );
		delete_option( 'nvm_bridge_require_account' );
		update_option( 'nvm_bridge_return_link', isset( $_POST['return_link'] ) ? 'yes' : 'no', false );
		update_option( NVM_Headless_Bridge::OPT_RECEIPT_ACTIONS, isset( $_POST['receipt_actions'] ) ? 'yes' : 'no', false );
		update_option( NVM_Headless_Bridge::OPT_RECEIPT_PRIMARY_LABEL, $receipt['primary_label'], false );
		update_option( NVM_Headless_Bridge::OPT_RECEIPT_PRIMARY_PATH, $receipt['primary_path'], false );
		update_option( NVM_Headless_Bridge::OPT_RECEIPT_SECONDARY_LABEL, $receipt['secondary_label'], false );
		update_option( NVM_Headless_Bridge::OPT_RECEIPT_SECONDARY_PATH, $receipt['secondary_path'], false );

		/* Public WordPress pages may already exist in LiteSpeed's page cache.
		 * Purge them when ownership or origins change so the redirect policy takes
		 * effect on the next request instead of after an arbitrary cache expiry. */
		do_action( 'litespeed_purge_all' );
		$synced = NVM_Access_Policy_Sync::changed();
		self::back( $synced ? 'success' : 'warning', $synced
			? 'Headless Core settings saved and access policy sync accepted.'
			: 'Headless Core settings saved. Access policy sync is pending; the previous storefront setting may remain in effect until a retry succeeds.' );
	}

	public static function rotate(): void {
		self::guard( 'rotate' );

		delete_option( NVM_Headless_Bridge::OPT_SECRET );
		NVM_Headless_Bridge::secret();

		self::back( 'warning', 'The bridge key was rotated. Update NVM_BRIDGE_KEY on the storefront before sending traffic. The new key is shown on this page.' );
	}

	public static function render(): void {
		if ( ! current_user_can( self::CAP ) ) return;

		$notice = get_transient( self::NOTICE . '_' . get_current_user_id() );
		delete_transient( self::NOTICE . '_' . get_current_user_id() );

		$extra = get_option( self::OPT_EXTRA, array() );
		$extra = is_array( $extra ) ? implode( "\n", $extra ) : '';
		$receipt = NVM_Headless_Bridge::receipt_action_settings();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'NVM Headless Core', 'nvm-headless-bridge' ); ?></h1>
			<p>The core owns storefront origins, redirects, identity, cart recovery and the native checkout handoff. Site-specific product data and pricing belong in the site commerce plugin.</p>

			<?php if ( is_array( $notice ) ) : ?>
				<div class="notice notice-<?php echo esc_attr( $notice['kind'] ); ?> is-dismissible"><p><?php echo esc_html( $notice['message'] ); ?></p></div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="nvm_bridge_save">
				<?php wp_nonce_field( 'nvm_bridge_save' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">Core status</th>
						<td><label><input type="checkbox" name="enabled" <?php checked( NVM_Headless_Bridge::is_enabled() ); ?>> Enable Headless Core</label></td>
					</tr>
					<tr>
						<th scope="row">Traffic owner</th>
						<td>
							<label><input type="checkbox" name="traffic_owner" value="nextjs" <?php checked( NVM_Headless_Bridge::nextjs_owns_traffic() ); ?>> Next.js owns customer traffic</label>
							<p class="description">Off keeps the WordPress store live. On permanently redirects customer-facing WordPress pages to the production storefront.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="nvm-frontend">Production storefront</label></th>
						<td>
							<input id="nvm-frontend" class="regular-text code" type="url" name="frontend_url" value="<?php echo esc_attr( get_option( NVM_Headless_Bridge::OPT_FRONTEND, '' ) ); ?>" placeholder="https://www.example.com">
							<p class="description">The safe fallback for password-reset links and requests without a handoff context. Never set this to localhost on production.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="nvm-origins">Additional allowed origins</label></th>
						<td>
							<textarea id="nvm-origins" class="large-text code" rows="5" name="extra_origins" placeholder="http://localhost:3000"><?php echo esc_textarea( $extra ); ?></textarea>
							<p class="description">One exact scheme, host and port per line. These may start a handoff but never become the production fallback.</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Checkout</th>
						<td>
							<fieldset>
								<label><input type="checkbox" name="checkout_skin" <?php checked( 'yes', get_option( 'nvm_bridge_checkout_skin', 'no' ) ); ?>> Use the standalone checkout and receipt template</label>
								<p class="description">Off by default. This replaces the theme wrapper; it does not create WooCommerce checkout pages.</p>
								<br>
								<label><input type="checkbox" name="require_account" <?php checked( NVM_Headless_Bridge::checkout_account_required() ); ?>> Require an account at checkout</label>
								<p class="description">This edits WooCommerce's own guest-checkout setting. Core does not keep a duplicate.</p>
								<br>
								<label><input type="checkbox" name="return_link" <?php checked( 'yes', get_option( 'nvm_bridge_return_link', 'yes' ) ); ?>> Show Back to shop on checkout and receipts</label>
							</fieldset>
						</td>
						</tr>
						<tr>
							<th scope="row">Storefront access</th>
							<td>
								<label><input type="checkbox" name="require_storefront_login" <?php checked( NVM_Headless_Bridge::storefront_login_required() ); ?>> Require login to browse the Next.js storefront</label>
								<p class="description">Independent of checkout. Changes are pushed to the storefront's Global Config; a direct Bridge read is used until synchronization is available.</p>
								<?php $sync = get_option( NVM_Access_Policy_Sync::OPT_LAST, array() ); if ( is_array( $sync ) && ! empty( $sync['at'] ) ) : ?>
									<p class="description">Last policy sync: <?php echo esc_html( $sync['at'] ); ?>, <?php echo ! empty( $sync['ok'] ) ? 'accepted' : 'pending retry'; ?>.</p>
								<?php endif; ?>
							</td>
						</tr>
						<tr>
							<th scope="row">Receipt actions</th>
						<td>
							<label><input type="checkbox" name="receipt_actions" <?php checked( NVM_Headless_Bridge::receipt_actions_enabled() ); ?>> Show two action buttons in the standalone receipt chrome</label>
							<p class="description">Off by default. These buttons render only when the standalone checkout and receipt template is enabled.</p>
							<p>
								<label for="nvm-receipt-primary-label"><strong>Primary button text</strong></label><br>
								<input id="nvm-receipt-primary-label" class="regular-text" type="text" name="receipt_primary_label" value="<?php echo esc_attr( $receipt['primary_label'] ); ?>">
							</p>
							<p>
								<label for="nvm-receipt-primary-path"><strong>Primary button path</strong></label><br>
								<input id="nvm-receipt-primary-path" class="regular-text code" type="text" name="receipt_primary_path" value="<?php echo esc_attr( $receipt['primary_path'] ); ?>" placeholder="/shop">
							</p>
							<p>
								<label for="nvm-receipt-secondary-label"><strong>Secondary button text</strong></label><br>
								<input id="nvm-receipt-secondary-label" class="regular-text" type="text" name="receipt_secondary_label" value="<?php echo esc_attr( $receipt['secondary_label'] ); ?>">
							</p>
							<p>
								<label for="nvm-receipt-secondary-path"><strong>Secondary button path</strong></label><br>
								<input id="nvm-receipt-secondary-path" class="regular-text code" type="text" name="receipt_secondary_path" value="<?php echo esc_attr( $receipt['secondary_path'] ); ?>" placeholder="/account/orders/{order_id}">
							</p>
							<p class="description">Use paths on the configured storefront, such as <code>/shop</code>. The secondary path may use <code>{order_id}</code>. Absolute URLs are rejected.</p>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save settings' ); ?>
			</form>

			<hr>
			<h2>Bridge key</h2>
			<p><code><?php echo esc_html( NVM_Headless_Bridge::secret() ); ?></code></p>
			<p class="description">Store this only as NVM_BRIDGE_KEY on the Next.js server.</p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="nvm_bridge_rotate">
				<?php wp_nonce_field( 'nvm_bridge_rotate' ); ?>
				<?php submit_button( 'Rotate bridge key', 'secondary', 'submit', false ); ?>
			</form>
		</div>
		<?php
	}
}
