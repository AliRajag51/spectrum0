<?php
/**
 * Open the headless core's routes through the store gate.
 *
 * `tpc-store` answers 401 to every anonymous REST route it has not been told
 * about, and it reads that list from the `tpc_store_gate_rest_allowlist`
 * filter as PCRE patterns matched against the route. NVM Headless Core lives
 * under `/nvm/v1` and is reached by the storefront server, which is anonymous
 * as far as WordPress is concerned; without this entry every bridge call
 * dies at the gate before the bridge key is even read. The bridge's own
 * key check and rate limits are what protect those routes, not the gate.
 *
 * `/tpc/v1` is this plugin's own public read, the lab reports of contract 9.1.
 * It is behind the same gate for the same reason - the storefront server is
 * anonymous - and it is safe to open because it publishes only what is already
 * printed on the certificates the shop hands out, and answers GET alone.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Gate_Allowlist {

	const FILTER      = 'tpc_store_gate_rest_allowlist';
	const PATTERN     = '#^/nvm/v1(/|$)#i';
	const PATTERN_TPC = '#^/tpc/v1(/|$)#i';

	public static function boot(): void {
		add_filter( self::FILTER, array( self::class, 'allow_bridge' ) );
	}

	/** Every namespace this plugin needs the gate to pass anonymously. */
	public static function patterns(): array {
		return array( self::PATTERN, self::PATTERN_TPC );
	}

	/**
	 * @param mixed $patterns Whatever the gate passes; anything that is not an array is replaced.
	 * @return string[]
	 */
	public static function allow_bridge( $patterns ): array {
		$patterns = is_array( $patterns ) ? $patterns : array();
		foreach ( self::patterns() as $pattern ) {
			if ( ! in_array( $pattern, $patterns, true ) ) {
				$patterns[] = $pattern;
			}
		}
		return $patterns;
	}
}
