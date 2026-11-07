<?php
/** Native AffiliateWP visit capture on a top-level browser navigation. */
defined( 'ABSPATH' ) || exit;

final class NVM_Affiliate_Navigation {
    public static function boot(): void {
        add_action( 'rest_api_init', array( self::class, 'routes' ) );
        // Before the general WP storefront redirect and native fallback tracker.
        add_action( 'template_redirect', array( self::class, 'navigate' ), -10000 );
    }

    public static function routes(): void {
        register_rest_route( 'nvm/v1', '/affiliate/navigation', array(
            'methods' => 'POST',
            'permission_callback' => array( 'NVM_Headless_Bridge', 'rest_permission' ),
            'callback' => array( self::class, 'start' ),
        ) );
    }

    private static function ready(): bool {
        return function_exists( 'affiliate_wp' ) && isset( affiliate_wp()->tracking )
            && is_callable( array( affiliate_wp()->tracking, 'fallback_track_visit' ) );
    }

    private static function text( WP_REST_Request $request, string $key, int $max ): string {
        $value = $request->get_param( $key );
        return is_string( $value ) && strlen( $value ) <= $max ? $value : '';
    }

    public static function start( WP_REST_Request $request ) {
        if ( ! self::ready() ) return new WP_Error( 'nvm_affiliate_unavailable', 'AffiliateWP is unavailable.', array( 'status' => 503 ) );
        $frontend = self::text( $request, 'frontend', 255 );
        $path = self::text( $request, 'return_path', 2048 );
        $referral = self::text( $request, 'referral', 100 );
        if ( ! in_array( $frontend, NVM_Headless_Bridge::frontend_urls(), true )
            || '' === $path || '/' !== $path[0] || str_starts_with( $path, '//' )
            || preg_match( '/[\\\\\r\n]/', $path )
            || preg_match( '#^/(?:en/|es/)?(?:api|_next|account|login|order-confirmation)(?:/|\?|$)#', $path )
            || ! preg_match( '/\A[a-zA-Z0-9_.@-]{1,100}\z/D', $referral ) ) {
            return new WP_Error( 'nvm_affiliate_invalid', 'Invalid referral navigation.', array( 'status' => 400 ) );
        }
        $path = remove_query_arg( affiliate_wp()->tracking->get_referral_var(), $path );
        $referrer = self::text( $request, 'referrer', 255 );
        $parts = wp_parse_url( $referrer );
        if ( ! is_array( $parts ) || ! in_array( $parts['scheme'] ?? '', array( 'http', 'https' ), true ) ) $referrer = '';
        $code = NVM_Headless_Bridge::mint_affiliate_navigation( array(
            'frontend' => $frontend, 'path' => $path, 'referral' => $referral,
            'campaign' => sanitize_text_field( self::text( $request, 'campaign', 100 ) ),
            'referrer' => $referrer,
        ) );
        if ( '' === $code ) return new WP_Error( 'nvm_affiliate_unavailable', 'Referral navigation could not be saved.', array( 'status' => 503 ) );
        return rest_ensure_response( array( 'url' => add_query_arg( 'nvm-affiliate', $code, home_url( '/' ) ) ) );
    }

    public static function navigate(): void {
        if ( ! isset( $_GET['nvm-affiliate'] ) ) return;
        nocache_headers();
        header( 'Cache-Control: private, no-store' );
        header( 'Referrer-Policy: no-referrer' );
        if ( 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' )
            || ! in_array( $_SERVER['HTTP_SEC_FETCH_MODE'] ?? 'navigate', array( 'navigate' ), true )
            || ! in_array( $_SERVER['HTTP_SEC_FETCH_DEST'] ?? 'document', array( 'document' ), true ) ) {
            status_header( 400 ); exit;
        }
        if ( ! self::ready() ) { status_header( 503 ); exit; }
        $code = is_string( $_GET['nvm-affiliate'] ) ? wp_unslash( $_GET['nvm-affiliate'] ) : '';
        $data = NVM_Headless_Bridge::consume_affiliate_navigation( $code );
        if ( ! is_array( $data ) || ! in_array( $data['frontend'] ?? '', NVM_Headless_Bridge::frontend_urls(), true ) ) {
            status_header( 410 ); echo 'This referral link expired. Open the original link again.'; exit;
        }
        $tracking = affiliate_wp()->tracking;
        $tracking->referral = $data['referral'];
        $_REQUEST['campaign'] = $data['campaign'];
        $_SERVER['HTTP_REFERER'] = $data['referrer'];
        $page_url = static function () use ( $data ) { return $data['frontend'] . $data['path']; };
        add_filter( 'affwp_get_current_page_url', $page_url );
        // AffiliateWP owns validation, first/last credit policy, real visits,
        // native cookie names/expiry, and downstream WooCommerce commissions.
        $tracking->fallback_track_visit();
        remove_filter( 'affwp_get_current_page_url', $page_url );
        // Do not let AffiliateWP append a referral query and restart the bounce.
        remove_filter( 'wp_redirect', array( $tracking, 'redirect_with_referral_link' ), 100 );
        $target = $data['frontend'] . $data['path'];
        // The exact origin and relative path were allowlisted before minting.
        wp_redirect( $target, 303, 'NVM Affiliate Navigation' );
        exit;
    }
}
