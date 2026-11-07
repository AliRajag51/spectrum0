<?php
/**
 * Certificates reach the storefront on the same webhook as everything else.
 *
 * Certificate Reports Manager fires no action of its own when a COA is
 * uploaded, replaced or deleted, so a new lot used to sit behind the
 * catalogue's one-hour window with nothing to push it. The obvious fix is a
 * second notification path; this deliberately is not one. It watches the three
 * admin-ajax actions that plugin already registers and, when one of them really
 * changed a row, hands the product to `TPC_Storefront_Revalidation::queue()` —
 * the same queue, the same signed `tpc.product` delivery, the same dedupe.
 *
 * Why `shutdown` rather than a later callback on the same ajax action: those
 * handlers end in `wp_send_json_*`, which calls `wp_die()`, so nothing else
 * registered on that hook ever runs. `shutdown` still fires after `wp_die()`.
 *
 * Why a fingerprint rather than trusting the request: the handler may reject
 * the upload, and firing on intent would publish "this product changed" when
 * nothing did. The count, newest row and newest timestamp are read before and
 * after; a refresh is queued only when they differ. That also makes delete and
 * edit work through the same path without special cases.
 *
 * @package Peptide_Collective_Commerce
 */

defined( 'ABSPATH' ) || exit;

final class TPC_COA_Watcher {

	/** The mutating actions Certificate Reports Manager registers. */
	const ACTIONS = array(
		'coa_upload_certificate',
		'coa_update_certificate',
		'coa_delete_certificate',
	);

	/** @var array<int, string> product id => fingerprint taken before the handler ran. */
	private static $before = array();

	/** @var bool */
	private static $watching = false;

	public static function boot(): void {
		foreach ( self::ACTIONS as $action ) {
			// Priority 1: ahead of their handler, which ends the request.
			add_action( 'wp_ajax_' . $action, array( self::class, 'capture' ), 1 );
		}
	}

	/**
	 * Note what the product's certificates look like before the handler runs.
	 */
	public static function capture(): void {
		$product_id = isset( $_POST['product_id'] ) ? absint( wp_unslash( $_POST['product_id'] ) ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- their handler owns the nonce; this only reads an id.

		if ( $product_id <= 0 || ! self::table_exists() ) {
			return;
		}

		self::$before[ $product_id ] = self::fingerprint( $product_id );

		if ( ! self::$watching ) {
			self::$watching = true;
			add_action( 'shutdown', array( self::class, 'settle' ), 1 );
		}
	}

	/**
	 * After the handler has answered, queue a refresh for anything that moved.
	 */
	public static function settle(): void {
		if ( ! class_exists( 'TPC_Storefront_Revalidation' ) ) {
			return;
		}

		foreach ( self::$before as $product_id => $was ) {
			if ( self::fingerprint( $product_id ) === $was ) {
				continue;
			}
			TPC_Storefront_Revalidation::queue( $product_id, 'certificate' );
		}

		self::$before = array();
	}

	/**
	 * Count, newest row and newest upload for one product, as one string.
	 *
	 * Deliberately not a hash of every row: a replaced file keeps its id but
	 * moves `uploaded_date`, and a deletion moves the count, so these three
	 * together catch all of upload, replace and delete in one cheap query.
	 */
	private static function fingerprint( int $product_id ): string {
		global $wpdb;

		$table = $wpdb->prefix . 'coa_reports_history';

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT COUNT(*) AS n, COALESCE(MAX(id),0) AS newest, COALESCE(MAX(uploaded_date),'') AS touched
				 FROM {$table} WHERE product_id = %d",
				$product_id
			)
		);
		// phpcs:enable

		return $row ? ( (int) $row->n . '|' . (int) $row->newest . '|' . (string) $row->touched ) : '0|0|';
	}

	private static function table_exists(): bool {
		static $exists = null;

		if ( null === $exists ) {
			global $wpdb;
			$table  = $wpdb->prefix . 'coa_reports_history';
			$exists = (bool) $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ); // phpcs:ignore WordPress.DB
		}

		return $exists;
	}
}
