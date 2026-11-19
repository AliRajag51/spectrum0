<?php
/**
 * Plugin Name: Spectrum Contact Mail
 * Description: Supplies the contact-form helpers Spectrum Commerce expects (recipient + optional Cloudflare Turnstile). Mail itself goes through wp_mail, i.e. FluentSMTP once its Hostinger connection is saved.
 * Version: 1.0.0
 */
defined( 'ABSPATH' ) || exit;

// Inbox for contact-form messages. Set option spectrum_contact_recipient to change it.
if ( ! function_exists( 'tpc_contact_recipient' ) ) {
	function tpc_contact_recipient(): string {
		$to = (string) get_option( 'spectrum_contact_recipient', '' );
		return is_email( $to ) ? $to : (string) get_option( 'admin_email' );
	}
}

// Turnstile is enforced only when a secret key is stored (option spectrum_turnstile_secret).
if ( ! function_exists( 'tpc_contact_turnstile_enabled' ) ) {
	function tpc_contact_turnstile_enabled(): bool {
		return '' !== (string) get_option( 'spectrum_turnstile_secret', '' );
	}
}

if ( ! function_exists( 'tpc_contact_turnstile_check' ) ) {
	/** @return true|'robot'|'failed' */
	function tpc_contact_turnstile_check() {
		if ( ! tpc_contact_turnstile_enabled() ) return true; // honeypot + rate limit still apply
		$token = sanitize_text_field( wp_unslash( $_POST['cf-turnstile-response'] ?? '' ) );
		if ( '' === $token ) return 'robot';
		$r = wp_remote_post( 'https://challenges.cloudflare.com/turnstile/v0/siteverify', array(
			'timeout' => 8,
			'body'    => array( 'secret' => get_option( 'spectrum_turnstile_secret' ), 'response' => $token ),
		) );
		if ( is_wp_error( $r ) ) return 'failed';
		$body = json_decode( (string) wp_remote_retrieve_body( $r ), true );
		return ! empty( $body['success'] ) ? true : 'robot';
	}
}
