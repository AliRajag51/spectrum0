<?php
/**
 * Authenticated storefront forms.
 *
 * The browser submits to Next.js. Next.js validates and throttles the request,
 * then calls these routes with NVM Headless Core's server-only bridge key. Mail
 * and Mautic remain in WordPress, where their credentials and retry machinery
 * already live.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Form_Bridge {
	private const REST_NS = 'nvm/v1';
	private const IDEMPOTENCY_TTL = 15 * MINUTE_IN_SECONDS;
	private const RATE_TTL = HOUR_IN_SECONDS;
	private const RATE_MAX = 5;

	public static function boot(): void {
		add_action( 'rest_api_init', array( self::class, 'register_routes' ) );
		add_action( 'init', array( self::class, 'ensure_subscriber_retry' ), 20 );
		add_action( 'tpc_form_subscriber_retry', array( self::class, 'retry_subscribers' ) );
		add_filter( 'tpc_contact_turnstile_hostnames', array( self::class, 'contact_hostnames' ) );
	}

	/** Action Scheduler still runs when WordPress pseudo-cron is disabled. */
	public static function ensure_subscriber_retry(): void {
		if ( function_exists( 'as_has_scheduled_action' ) && function_exists( 'as_schedule_recurring_action' )
			&& ! as_has_scheduled_action( 'tpc_form_subscriber_retry', array(), 'tpc-forms' ) ) {
			as_schedule_recurring_action( time() + MINUTE_IN_SECONDS, HOUR_IN_SECONDS, 'tpc_form_subscriber_retry', array(), 'tpc-forms' );
		}
	}

	public static function retry_subscribers(): void {
		if ( ! function_exists( 'tpc_subscribe_push' ) ) {
			return;
		}
		$pending = get_posts(
			array(
				'post_type'      => 'tpc_subscriber',
				'post_status'    => 'private',
				'posts_per_page' => 25,
				'orderby'        => 'date',
				'order'          => 'ASC',
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_query'     => array( array( 'key' => 'tpc_sub_status', 'value' => 'pending' ) ),
			)
		);
		foreach ( $pending as $post_id ) {
			tpc_subscribe_push( (int) $post_id );
		}
	}

	public static function contact_hostnames( $hosts ): array {
		$hosts = is_array( $hosts ) ? $hosts : array();
		$storefront_hosts = array(
			'spectrumbiosciences.shop',
			'www.spectrumbiosciences.shop',
		);
		foreach ( $storefront_hosts as $hostname ) {
			if ( ! in_array( $hostname, $hosts, true ) ) {
				$hosts[] = $hostname;
			}
		}
		return $hosts;
	}

	public static function register_routes(): void {
		if ( ! class_exists( 'NVM_Headless_Bridge' ) ) {
			return;
		}

		foreach ( array( 'contact', 'subscribe' ) as $route ) {
			register_rest_route(
				self::REST_NS,
				'/site/' . $route,
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'contact' === $route ? 'rest_contact' : 'rest_subscribe' ),
					'permission_callback' => array( 'NVM_Headless_Bridge', 'rest_permission' ),
				)
			);
		}
	}

	private static function text( WP_REST_Request $request, string $key, int $max ): string {
		$value = $request->get_param( $key );
		if ( ! is_string( $value ) ) {
			return '';
		}
		$value = trim( str_replace( array( "\r\n", "\r" ), "\n", $value ) );
		$length = function_exists( 'mb_strlen' ) ? mb_strlen( $value, 'UTF-8' ) : strlen( $value );
		return $length <= $max ? $value : '';
	}

	private static function idempotency_key( WP_REST_Request $request, string $operation ): string {
		$key = self::text( $request, 'idempotency_key', 100 );
		if ( ! preg_match( '/\A[a-zA-Z0-9_-]{16,100}\z/D', $key ) ) {
			return '';
		}
		return 'tpc_form_' . $operation . '_' . hash( 'sha256', $key );
	}

	private static function rate_limited( WP_REST_Request $request, string $operation ): bool {
		$fingerprint = self::text( $request, 'client_key', 128 );
		if ( ! preg_match( '/\A[a-f0-9]{64}\z/D', $fingerprint ) ) {
			return true;
		}
		$key   = 'tpc_form_rl_' . $operation . '_' . $fingerprint;
		$count = (int) get_transient( $key );
		if ( $count >= self::RATE_MAX ) {
			return true;
		}
		set_transient( $key, $count + 1, self::RATE_TTL );
		return false;
	}

	private static function dry_run( WP_REST_Request $request ): bool {
		return rest_sanitize_boolean( $request->get_param( 'dry_run' ) );
	}

	public static function rest_contact( WP_REST_Request $request ) {
		$name       = sanitize_text_field( self::text( $request, 'name', 200 ) );
		$email      = sanitize_email( self::text( $request, 'email', 254 ) );
		$subject    = sanitize_text_field( self::text( $request, 'subject', 300 ) );
		$message    = sanitize_textarea_field( self::text( $request, 'message', 5000 ) );
		$honeypot   = self::text( $request, 'website', 200 );
		$turnstile  = self::text( $request, 'turnstile_token', 2048 );
		$idempotent = self::idempotency_key( $request, 'contact' );

		if ( ! is_email( $email ) || '' === $subject || '' === $idempotent ) {
			return new WP_Error( 'tpc_form_invalid', 'Please enter a valid email address and subject.', array( 'status' => 400 ) );
		}

		if ( self::dry_run( $request ) ) {
			return rest_ensure_response(
				array(
					'status' => 'ready',
					'checks' => array(
						'mail'       => function_exists( 'wp_mail' ),
						'recipient'  => function_exists( 'tpc_contact_recipient' ) && is_email( tpc_contact_recipient() ),
						'turnstile'  => function_exists( 'tpc_contact_turnstile_check' ) && function_exists( 'tpc_contact_turnstile_enabled' ) && tpc_contact_turnstile_enabled(),
					),
					'side_effects' => false,
				)
			);
		}

		if ( '' !== $honeypot ) {
			return rest_ensure_response( array( 'status' => 'sent' ) );
		}
		if ( self::rate_limited( $request, 'contact' ) ) {
			return new WP_Error( 'tpc_form_rate_limited', 'Too many messages. Please try again later.', array( 'status' => 429 ) );
		}
		$existing = get_transient( $idempotent );
		if ( is_array( $existing ) ) {
			return rest_ensure_response( $existing );
		}

		$previous = $_POST['cf-turnstile-response'] ?? null;
		$_POST['cf-turnstile-response'] = $turnstile;
		$human = function_exists( 'tpc_contact_turnstile_check' ) ? tpc_contact_turnstile_check() : 'failed';
		if ( null === $previous ) {
			unset( $_POST['cf-turnstile-response'] );
		} else {
			$_POST['cf-turnstile-response'] = $previous;
		}
		if ( true !== $human ) {
			$status = 'robot' === $human ? 400 : 503;
			return new WP_Error( 'tpc_form_turnstile_' . sanitize_key( (string) $human ), 'We could not verify this submission. Please try again.', array( 'status' => $status ) );
		}

		$body = array();
		if ( '' !== $name ) {
			$body[] = 'Name: ' . $name;
		}
		$body[] = 'Email: ' . $email;
		$body[] = 'Subject: ' . $subject;
		$body[] = '';
		$body[] = '' !== $message ? $message : '(no message body)';
		$recipient = function_exists( 'tpc_contact_recipient' ) ? tpc_contact_recipient() : get_option( 'admin_email' );
		$reply_to  = '' !== $name ? sprintf( '%s <%s>', $name, $email ) : $email;

		if ( ! wp_mail( $recipient, sprintf( 'Contact form: %s', $subject ), implode( "\n", $body ), array( 'Reply-To: ' . $reply_to ) ) ) {
			return new WP_Error( 'tpc_form_mail_failed', 'The message could not be sent. Please try again shortly.', array( 'status' => 503 ) );
		}

		$result = array( 'status' => 'sent' );
		set_transient( $idempotent, $result, self::IDEMPOTENCY_TTL );
		return rest_ensure_response( $result );
	}

	public static function rest_subscribe( WP_REST_Request $request ) {
		$email      = sanitize_email( self::text( $request, 'email', 254 ) );
		$locale     = 'es' === sanitize_key( self::text( $request, 'locale', 5 ) ) ? 'es' : 'en';
		$source     = 'popup' === sanitize_key( self::text( $request, 'source', 20 ) ) ? 'popup' : 'footer';
		$idempotent = self::idempotency_key( $request, 'subscribe' );

		if ( ! is_email( $email ) || '' === $idempotent ) {
			return new WP_Error( 'tpc_subscribe_invalid', 'Please enter a valid email address.', array( 'status' => 400 ) );
		}

		$durable_ready = function_exists( 'tpc_subscribe_find' ) && function_exists( 'tpc_subscribe_push' );
		$offer_ready   = function_exists( 'mac_update_mautic_contact' );
		if ( self::dry_run( $request ) ) {
			return rest_ensure_response(
				array(
					'status'       => 'ready',
					'checks'       => array( 'durable_subscriber' => $durable_ready, 'mautic_queue' => $offer_ready ),
					'side_effects' => false,
				)
			);
		}

		if ( self::rate_limited( $request, 'subscribe' ) ) {
			return new WP_Error( 'tpc_subscribe_rate_limited', 'Too many subscriptions. Please try again later.', array( 'status' => 429 ) );
		}
		$existing = get_transient( $idempotent );
		if ( is_array( $existing ) ) {
			return rest_ensure_response( $existing );
		}

		if ( 'popup' === $source && $offer_ready ) {
			$fields = array(
				'tpc_offer_optin'   => 'yes',
				'tpc_offer_code'    => 'WELCOME30',
				'tpc_offer_date'    => current_time( 'mysql' ),
				'tags'              => array( 'es' === $locale ? 'domain-com-es' : 'domain-com' ),
			);
			mac_update_mautic_contact( $email, $fields );
			$result = array( 'status' => 'queued' );
			set_transient( $idempotent, $result, self::IDEMPOTENCY_TTL );
			return rest_ensure_response( $result );
		}

		if ( ! $durable_ready ) {
			return new WP_Error( 'tpc_subscribe_unavailable', 'Subscriptions are temporarily unavailable.', array( 'status' => 503 ) );
		}

		$post_id = (int) tpc_subscribe_find( $email );
		if ( ! $post_id ) {
			$post_id = wp_insert_post(
				array(
					'post_type'   => 'tpc_subscriber',
					'post_status' => 'private',
					'post_title'  => $email,
				),
				true
			);
			if ( is_wp_error( $post_id ) ) {
				return new WP_Error( 'tpc_subscribe_save_failed', 'The subscription could not be saved.', array( 'status' => 503 ) );
			}
		}
		update_post_meta( $post_id, 'tpc_sub_status', 'pending' );
		update_post_meta( $post_id, 'tpc_sub_lang', function_exists( 'tpc_subscribe_lang' ) ? tpc_subscribe_lang( $locale ) : $locale );
		update_post_meta( $post_id, 'tpc_sub_source', 'es' === $locale ? 'newsletter_band_es' : 'newsletter_band' );
		$pushed = tpc_subscribe_push( $post_id );
		if ( ! $pushed && function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( 'tpc_form_subscriber_retry', array(), 'tpc-forms', true );
		}

		$result = array( 'status' => 'queued' );
		set_transient( $idempotent, $result, self::IDEMPOTENCY_TTL );
		return rest_ensure_response( $result );
	}
}
