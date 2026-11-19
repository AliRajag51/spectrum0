<?php
/**
 * Plugin Name: Spectrum SEO Redirects
 * Description: Companion to the NVM storefront router. Public apex pages move permanently (301) to www; stray apex 404s forward to www; crawlers may read the redirects. Checkout, account and cart hops keep the router's 302.
 * Version: 1.0.0
 */
defined( 'ABSPATH' ) || exit;

const SPECTRUM_WWW = 'https://www.spectrumbiosciences.shop';

function spectrum_seo_active(): bool {
	return class_exists( 'NVM_Headless_Bridge' ) && NVM_Headless_Bridge::nextjs_owns_traffic()
		&& 'spectrumbiosciences.shop' === strtolower( explode( ':', (string) ( $_SERVER['HTTP_HOST'] ?? '' ) )[0] );
}

// Upgrade only public-page hops; anything touching cart/account/checkout stays temporary.
add_filter( 'wp_redirect_status', static function ( $status, $location ) {
	if ( 302 !== (int) $status || ! spectrum_seo_active() || is_user_logged_in() ) return $status;
	if ( 0 !== strpos( (string) $location, SPECTRUM_WWW . '/' ) ) return $status;
	$path = (string) wp_parse_url( $location, PHP_URL_PATH );
	if ( preg_match( '#^/(?:cart|account|checkout|api)(?:/|$)#i', $path ) || false !== strpos( (string) $location, 'error=' ) ) return $status;
	return 301;
}, 10, 2 );

// Apex URLs WordPress has no page for (e.g. /about/) belong to the storefront.
add_action( 'template_redirect', static function () {
	if ( ! spectrum_seo_active() || ! is_404() || is_admin() || ! in_array( $_SERVER['REQUEST_METHOD'] ?? 'GET', array( 'GET', 'HEAD' ), true ) ) return;
	$target = class_exists( 'NVM_Storefront_Router' ) ? NVM_Storefront_Router::target_for_request() : null;
	if ( ! $target || 0 !== strpos( $target, SPECTRUM_WWW . '/' ) ) return;
	$path = (string) wp_parse_url( $target, PHP_URL_PATH );
	$aliases = array( '/contact-us' => '/contact', '/contact-us/' => '/contact' );
	$clean = '/' . trim( $path, '/' );
	$target = SPECTRUM_WWW . ( $aliases[ $clean ] ?? ( '/' === $clean ? '/' : $clean ) ) . ( ( $q = wp_parse_url( $target, PHP_URL_QUERY ) ) ? '?' . $q : '' );
	nocache_headers();
	do_action( 'litespeed_control_set_nocache', 'spectrum 404 forward' );
	wp_redirect( $target, 301, 'Spectrum SEO Redirects' );
	exit;
}, 5 );

// Crawlers must be allowed to fetch apex URLs, or they never see the 301s.
add_filter( 'robots_txt', static function ( $robots ) {
	if ( ! spectrum_seo_active() ) return $robots;
	return "User-agent: *\nAllow: /\nDisallow: /wp-admin/\nDisallow: /checkout/\nDisallow: /my-account/\nSitemap: " . SPECTRUM_WWW . "/sitemap.xml\n";
}, 200 );
