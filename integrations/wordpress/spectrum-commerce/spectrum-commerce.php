<?php
/**
 * Plugin Name:       Spectrum Commerce
 * Description:       The site half of the headless split: everything about this shop's product contract that NVM Headless Core must not know. Bundle & Save pricing by line quantity, restock alerts emailed when a strength comes back, the extensions.tpc product contract the storefront reads its catalogue from, and the webhook that tells the storefront a product changed.
 * Version:           1.7.2-spectrum.1
 *
 * Forked from Peptide Collective Commerce 1.7.2 for Spectrum Biosciences. The
 * internal `tpc` prefix (options, routes, `extensions.tpc`) is kept on purpose:
 * it is the contract the storefront and NVM Headless Core already speak.
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Text Domain:       spectrum-commerce
 *
 * NVM Headless Core owns transport, auth, cart recovery, handoff and redirect
 * policy, and is shared across storefronts. Pricing rules are this shop's, so
 * they live here.
 *
 * Since 1.6.0 the pricing rule is Bundle & Save, in
 * includes/class-tpc-bundle-save.php: the tier is a function of the line
 * quantity, applied by WooCommerce to the real line item, and published to the
 * storefront at /wp-json/tpc/v1/bundle-tiers so the badge and the bill are one
 * rule read twice. It replaces the pack tier that used to travel as cart item
 * data - which opened a line per tier, multiplied with the quantity stepper,
 * and charged a shopper who picked "2 Packs" with the stepper on two for four
 * vials.
 *
 * Restock alerts live in includes/class-tpc-stock-alerts.php: the list of who
 * is waiting on which strength, the route the storefront files it through,
 * and the one email WooCommerce's stock hooks send when it comes back.
 *
 * Since 1.3.0 three more modules, each in includes/ and each described in
 * docs/integration-contract.md of the storefront repository:
 *
 * - class-tpc-product-contract.php publishes `extensions.tpc` on Store API
 *   products: storefront key, category, current lot, certificate history and
 *   every variation's price and stock, so the storefront needs no wc/v3 key.
 * - class-tpc-gate-allowlist.php lets the tpc-store REST gate pass anonymous
 *   calls to NVM Headless Core's /nvm/v1 routes, which carry their own key.
 * - class-tpc-storefront-revalidation.php POSTs a signed `tpc.product`
 *   webhook to the storefront when a product changes, and adds
 *   `wp tpc-commerce refresh` for the changes that have no hook.
 *
 * Since 1.4.0, class-tpc-lab-reports.php publishes the `lab-report` post type
 * at `GET /wp-json/tpc/v1/lab-reports` - the purity, weight, endotoxin,
 * sterility and heavy-metal numbers the storefront used to carry as a
 * hand-written file - and pushes each edit through the same revalidation queue
 * as a `tpc.report` delivery.
 *
 * Since 1.5.0 the product contract also carries `coa`: the certificate picture
 * the WordPress product page shows beside the vial, and the purity printed on
 * it. The theme appends that picture to the WooCommerce gallery behind an
 * `is_product()` check, so it never appears in the Store API; the storefront
 * would otherwise have no way to show the same document.
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/includes/class-tpc-checkout-chrome.php';
TPC_Checkout_Chrome::boot();

require_once __DIR__ . '/includes/class-tpc-bundle-save.php';
TPC_Bundle_Save::boot();

require_once __DIR__ . '/includes/class-tpc-free-shipping-only.php';
TPC_Free_Shipping_Only::boot();

require_once __DIR__ . '/includes/class-tpc-stock-alerts.php';
TPC_Stock_Alerts::boot();
register_activation_hook( __FILE__, array( 'TPC_Stock_Alerts', 'install' ) );

require_once __DIR__ . '/includes/class-tpc-product-contract.php';
TPC_Product_Contract::boot();
register_activation_hook( __FILE__, array( 'TPC_Product_Contract', 'install' ) );

require_once __DIR__ . '/includes/class-tpc-gate-allowlist.php';
TPC_Gate_Allowlist::boot();

require_once __DIR__ . '/includes/class-tpc-form-bridge.php';
TPC_Form_Bridge::boot();

require_once __DIR__ . '/includes/class-tpc-storefront-revalidation.php';
TPC_Storefront_Revalidation::boot();

/* Certificate uploads ride the same revalidation queue; see the class docblock
   for why this watches the certificate plugin rather than adding a second
   notification path. */
require_once __DIR__ . '/includes/class-tpc-coa-watcher.php';
TPC_COA_Watcher::boot();

/* The lab report read and its tpc.report deliveries. Loaded after the
   revalidation module because it queues through it, and after the product
   contract because it resolves reports to storefront keys with it. */
require_once __DIR__ . '/includes/class-tpc-lab-reports.php';
TPC_Lab_Reports::boot();

// NVM Headless Core reports the site plugin's version at /nvm/v1/health
// through this filter; it does not know this class by name.
add_filter(
	'nvm_bridge_site_plugin_version',
	static function () {
		return TPC_Bundle_Save::VERSION;
	}
);
