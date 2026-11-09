<?php
/** Hide site navigation on checkout without replacing WooCommerce templates. */
defined( 'ABSPATH' ) || exit;

final class TPC_Checkout_Chrome {

	public static function boot(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ), 100 );
		// NVM Headless Core's checkout skin names DM Sans and Sora in its tokens
		// (option nvm_checkout_skin_tokens); WordPress has to load them itself.
		add_filter( 'nvm_checkout_skin_webfont', array( self::class, 'webfont' ) );
	}

	public static function webfont(): string {
		return 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap';
	}

	public static function applies(): bool {
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return false;
		}

		return ( function_exists( 'is_checkout' ) && is_checkout() )
			|| ( function_exists( 'is_order_received_page' ) && is_order_received_page() );
	}

	public static function enqueue(): void {
		if ( ! self::applies() ) {
			return;
		}

		$root = dirname( __DIR__ );
		$file = $root . '/assets/checkout-chrome.css';
		wp_enqueue_style(
			'tpc-checkout-chrome',
			plugins_url( 'assets/checkout-chrome.css', $root . '/peptide-collective-commerce.php' ),
			array(),
			(string) filemtime( $file )
		);
	}
}
