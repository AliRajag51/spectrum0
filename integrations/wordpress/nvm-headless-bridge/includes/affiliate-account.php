<?php
/** Authenticated affiliate applications and native portal handoff. */
defined( 'ABSPATH' ) || exit;
final class NVM_Affiliate_Account {
    public static function boot(): void {
        // After cutover, old native registration forms must not create accounts
        // or bypass the authenticated application and its duplicate protection.
        add_action( 'affwp_pre_process_register_form', static function () {
            if ( NVM_Headless_Bridge::nextjs_owns_traffic() ) {
                affiliate_wp()->register->add_error( 'nvm_use_store_application', 'Please sign in to your store account and use the affiliate registration page on the storefront.' );
            }
        } );
        add_action( 'rest_api_init', static function () {
            foreach ( array( 'status', 'apply', 'portal' ) as $route ) {
                register_rest_route( 'nvm/v1', '/affiliate/' . $route, array(
                    'methods' => 'POST', 'permission_callback' => array( 'NVM_Headless_Bridge', 'rest_permission' ),
                    'callback' => array( self::class, $route ),
                ) );
            }
        } );
        add_action( 'template_redirect', array( self::class, 'navigate' ), -10001 );
    }
    private static function user( $request ) {
        if ( ! function_exists( 'affiliate_wp' ) ) return new WP_Error( 'nvm_affiliate_unavailable', 'Affiliate applications are unavailable.', array( 'status' => 503 ) );
        return NVM_Headless_Bridge::affiliate_user( $request );
    }
    private static function payload( int $uid ): array {
        $user = get_userdata( $uid );
        $affiliate = affwp_get_affiliate_id( $uid );
        return array(
            'status' => $affiliate ? affwp_get_affiliate_status( $affiliate ) : 'none',
            'name' => $user->display_name, 'username' => $user->user_login, 'email' => $user->user_email,
        );
    }
    public static function status( WP_REST_Request $request ) {
        $uid = self::user( $request );
        if ( is_wp_error( $uid ) ) return $uid;
        return rest_ensure_response( self::payload( $uid ) );
    }
    public static function apply( WP_REST_Request $request ) {
        $uid = self::user( $request );
        if ( is_wp_error( $uid ) ) return $uid;
        $fields = array();
        foreach ( array( 'name' => 100, 'paymentEmail' => 254, 'website' => 2048, 'promotion' => 4000 ) as $key => $max ) {
            $value = $request->get_param( $key );
            if ( ! is_string( $value ) || strlen( $value ) > $max ) return new WP_Error( 'nvm_affiliate_invalid', 'Check your application fields.', array( 'status' => 400 ) );
            $fields[$key] = trim( $value );
        }
        if ( '' === $fields['name'] || ( '' !== $fields['paymentEmail'] && ! is_email( $fields['paymentEmail'] ) ) || strlen( $fields['promotion'] ) < 10
            || true !== $request->get_param( 'terms' )
            || ! wp_http_validate_url( $fields['website'] ) || ! in_array( wp_parse_url( $fields['website'], PHP_URL_SCHEME ), array( 'http', 'https' ), true ) ) {
            return new WP_Error( 'nvm_affiliate_invalid', 'Check your application and accept the terms.', array( 'status' => 400 ) );
        }
        global $wpdb;
        $lock = 'nvm_affiliate_' . get_current_blog_id() . '_' . $uid;
        if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', $lock ) ) ) return new WP_Error( 'nvm_affiliate_busy', 'Your application is being saved. Refresh your status before trying again.', array( 'status' => 409 ) );
        try {
            if ( affwp_get_affiliate_id( $uid ) ) return rest_ensure_response( self::payload( $uid ) );
            wp_set_current_user( $uid );
            $args = array( 'user_id' => $uid, 'payment_email' => sanitize_email( $fields['paymentEmail'] ),
                'website_url' => esc_url_raw( $fields['website'] ), 'status' => 'pending',
                'dynamic_coupon' => '', 'registration_method' => 'affiliate_registration_form',
                'registration_url' => home_url( '/affiliate-registration-page/' ) );
            $id = affwp_add_affiliate( $args );
            if ( ! $id || is_wp_error( $id ) ) return new WP_Error( 'nvm_affiliate_failed', 'Application could not be saved. Please retry.', array( 'status' => 503 ) );
            affwp_update_affiliate_meta( $id, 'promotion_method', sanitize_textarea_field( $fields['promotion'] ) );
            affwp_update_affiliate_meta( $id, 'application_name', sanitize_text_field( $fields['name'] ) );
            affwp_update_affiliate_meta( $id, 'nvm_terms_accepted_at', gmdate( 'c' ) );
            do_action( 'affwp_register_user', $id, 'pending', array_merge( $args, array( 'display_name' => sanitize_text_field( $fields['name'] ), 'user_email' => get_userdata( $uid )->user_email ) ) );
            return rest_ensure_response( self::payload( $uid ) );
        } finally { $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) ); }
    }
    public static function portal( WP_REST_Request $request ) {
        $uid = self::user( $request );
        if ( is_wp_error( $uid ) ) return $uid;
        if ( 'active' !== self::payload( $uid )['status'] ) return new WP_Error( 'nvm_affiliate_pending', 'An approved affiliate account is required.', array( 'status' => 403 ) );
        $code = NVM_Headless_Bridge::affiliate_portal_code( (string) $request->get_param( 'auth' ) );
        if ( ! $code ) return new WP_Error( 'nvm_affiliate_unavailable', 'Please try again.', array( 'status' => 503 ) );
        return rest_ensure_response( array( 'url' => add_query_arg( 'nvm-affiliate-portal', $code, home_url( '/' ) ) ) );
    }
    public static function navigate(): void {
        if ( ! isset( $_GET['nvm-affiliate-portal'] ) ) return;
        nocache_headers();
        header( 'Cache-Control: private, no-store' );
        header( 'Referrer-Policy: no-referrer' );
        if ( 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'navigate' !== ( $_SERVER['HTTP_SEC_FETCH_MODE'] ?? 'navigate' ) ) { status_header( 400 ); exit; }
        $code = is_string( $_GET['nvm-affiliate-portal'] ) ? wp_unslash( $_GET['nvm-affiliate-portal'] ) : '';
        if ( ! NVM_Headless_Bridge::affiliate_portal_session( $code ) ) { status_header( 403 ); echo 'Please return to the store and check your affiliate status.'; exit; }
        $id = (int) affiliate_wp()->settings->get( 'affiliates_page' );
        $url = $id ? get_permalink( $id ) : home_url( '/my-account/affiliate-dashboard/' );
        wp_safe_redirect( $url, 303, 'NVM Affiliate Portal' );
        exit;
    }
}
