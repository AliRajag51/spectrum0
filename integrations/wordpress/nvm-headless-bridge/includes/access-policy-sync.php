<?php
/** Signed, bounded delivery of Bridge access policy changes to Next.js. */

defined( 'ABSPATH' ) || exit;

final class NVM_Access_Policy_Sync {
	const HOOK_RETRY = 'nvm_bridge_access_policy_retry';
	const HOOK_DAILY = 'nvm_bridge_access_policy_daily';
	const OPT_LAST   = 'nvm_bridge_access_policy_sync_last';

	public static function boot(): void {
		add_action( self::HOOK_RETRY, array( self::class, 'retry' ), 10, 1 );
		add_action( self::HOOK_DAILY, array( self::class, 'daily' ) );
		if ( ! wp_next_scheduled( self::HOOK_DAILY ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::HOOK_DAILY );
		}
	}

	/** Called after the settings have committed, so Next.js reads the final values. */
	public static function changed(): bool {
		return self::send( 0 );
	}

	public static function retry( $attempt ): void {
		self::send( max( 1, (int) $attempt ) );
	}

	public static function daily(): void {
		self::send( 3 ); // Reconcile once; a failure waits for the next daily run.
	}

	private static function send( int $attempt ): bool {
		$origin = NVM_Headless_Bridge::frontend_url();
		if ( ! NVM_Headless_Bridge::is_enabled() || ! str_starts_with( $origin, 'https://' ) ) {
			return false;
		}
		$body = (string) wp_json_encode( array(
			'event' => 'access-policy-changed',
			'at'    => time(),
			'nonce' => bin2hex( random_bytes( 16 ) ),
		) );
		$signature = base64_encode( hash_hmac( 'sha256', $body, NVM_Headless_Bridge::secret(), true ) );
		$response = wp_remote_post( $origin . '/api/internal/access-policy', array(
			'timeout'     => 5,
			'redirection' => 0,
			'headers'     => array(
				'Content-Type'           => 'application/json',
				'X-NVM-Policy-Signature' => $signature,
			),
			'body' => $body,
		) );
		$ok = ! is_wp_error( $response ) && (int) wp_remote_retrieve_response_code( $response ) >= 200
			&& (int) wp_remote_retrieve_response_code( $response ) < 300;
		update_option( self::OPT_LAST, array(
			'ok' => $ok,
			'at' => gmdate( 'c' ),
			'status' => is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response ),
		), false );
		if ( ! $ok && $attempt < 3 && ! wp_next_scheduled( self::HOOK_RETRY, array( $attempt + 1 ) ) ) {
			$delays = array( 0, 30, 120, 300 );
			wp_schedule_single_event( time() + $delays[ $attempt + 1 ], self::HOOK_RETRY, array( $attempt + 1 ) );
		}
		return $ok;
	}
}
