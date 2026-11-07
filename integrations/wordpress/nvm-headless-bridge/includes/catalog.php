<?php
/** Key-authenticated catalog transport. WooCommerce stays behind the bridge. */
defined( 'ABSPATH' ) || exit;

final class NVM_Catalog {
    public static function boot(): void {
        add_action( 'rest_api_init', array( self::class, 'register_route' ) );
    }

    public static function register_route(): void {
        register_rest_route( NVM_Headless_Bridge::REST_NS, '/catalog', array(
            'methods' => 'GET',
            'permission_callback' => array( 'NVM_Headless_Bridge', 'rest_permission' ),
            'callback' => array( self::class, 'respond' ),
            'args' => array(
                'page' => array( 'type' => 'integer', 'default' => 1, 'minimum' => 1, 'maximum' => 20 ),
                'per_page' => array( 'type' => 'integer', 'default' => 100, 'minimum' => 1, 'maximum' => 100 ),
            ),
        ) );
    }

    public static function respond( WP_REST_Request $request ) {
        // Internal dispatch preserves Woo's visibility, language and product schema
        // including companion-plugin extensions. No loopback HTTP or customer data.
        $inner = new WP_REST_Request( 'GET', '/wc/store/v1/products' );
        $inner->set_param( 'page', $request->get_param( 'page' ) );
        $inner->set_param( 'per_page', $request->get_param( 'per_page' ) );
        $inner->set_param( 'orderby', 'popularity' );
        $inner->set_param( 'order', 'desc' );
        $inner->set_header( 'x-nvm-bridge-key', $request->get_header( 'x-nvm-bridge-key' ) );
        $response = rest_do_request( $inner );
        // Only the storefront's public-data cache owns freshness. Never let an
        // intermediary cache a key-authenticated response or its errors.
        $response->header( 'Cache-Control', 'private, no-store' );
        return $response;
    }
}
