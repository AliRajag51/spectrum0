<?php
/**
 * Newsletter subscribers, kept in WordPress.
 *
 * TPC_Form_Bridge::rest_subscribe() stores a signup through two functions,
 * tpc_subscribe_find() and tpc_subscribe_push(), that Peptide Collective's
 * site gets from its mailing integration. Spectrum has none, so without these
 * every signup answered 503. Here a signup is a private `tpc_subscriber` post
 * (title = email) that the shop can see and export under WooCommerce →
 * Subscribers, and pushing it simply marks it subscribed. Connecting an email
 * service later means replacing tpc_subscribe_push(), nothing else.
 */

defined( 'ABSPATH' ) || exit;

final class TPC_Subscribers {

	const POST_TYPE = 'tpc_subscriber';

	public static function boot(): void {
		add_action( 'init', array( self::class, 'register' ) );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( self::class, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( self::class, 'column' ), 10, 2 );
	}

	public static function register(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'          => array(
					'name'          => 'Subscribers',
					'singular_name' => 'Subscriber',
					'menu_name'     => 'Subscribers',
				),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => class_exists( 'WooCommerce' ) ? 'woocommerce' : true,
				'show_in_rest'    => false,
				'supports'        => array( 'title' ),
				'capability_type' => 'post',
				'capabilities'    => array( 'create_posts' => 'do_not_allow' ),
				'map_meta_cap'    => true,
			)
		);
	}

	public static function columns( array $columns ): array {
		return array(
			'cb'     => $columns['cb'] ?? '',
			'title'  => 'Email',
			'status' => 'Status',
			'source' => 'Source',
			'date'   => 'Signed up',
		);
	}

	public static function column( string $column, int $post_id ): void {
		if ( 'status' === $column ) {
			echo esc_html( (string) get_post_meta( $post_id, 'tpc_sub_status', true ) );
		} elseif ( 'source' === $column ) {
			echo esc_html( (string) get_post_meta( $post_id, 'tpc_sub_source', true ) );
		}
	}
}

if ( ! function_exists( 'tpc_subscribe_find' ) ) {
	/** The subscriber post for this email, or 0. */
	function tpc_subscribe_find( string $email ): int {
		$email = strtolower( trim( $email ) );
		if ( '' === $email ) {
			return 0;
		}
		$ids = get_posts(
			array(
				'post_type'        => TPC_Subscribers::POST_TYPE,
				'post_status'      => 'private',
				'title'            => $email,
				'numberposts'      => 1,
				'fields'           => 'ids',
				'no_found_rows'    => true,
				'suppress_filters' => true,
			)
		);
		return $ids ? (int) $ids[0] : 0;
	}
}

if ( ! function_exists( 'tpc_subscribe_push' ) ) {
	/** No email service yet: the WordPress record is the list. */
	function tpc_subscribe_push( int $post_id ): bool {
		if ( TPC_Subscribers::POST_TYPE !== get_post_type( $post_id ) ) {
			return false;
		}
		update_post_meta( $post_id, 'tpc_sub_status', 'subscribed' );
		return true;
	}
}
