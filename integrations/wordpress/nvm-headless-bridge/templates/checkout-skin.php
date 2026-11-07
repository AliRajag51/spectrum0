<?php
/**
 * The whole document for checkout and order-received.
 *
 * Not a theme template with the header hidden — the theme's header and footer
 * are never rendered at all. wp_head() and wp_footer() still run, because
 * WooCommerce and every payment gateway put their scripts there and a checkout
 * that drops them is a checkout that cannot take money.
 */

if (!defined('ABSPATH')) {
    exit;
}

$nvm_is_receipt = function_exists('is_order_received_page') && is_order_received_page();
$nvm_brand      = NVM_Checkout_Skin::brand();

$nvm_order = null;
if ($nvm_is_receipt) {
    $nvm_order_id = absint(get_query_var('order-received'));
    if ($nvm_order_id) {
        $nvm_candidate = wc_get_order($nvm_order_id);
        $nvm_key       = isset($_GET['key']) ? wc_clean(wp_unslash($_GET['key'])) : '';

        // The order key is the only thing standing between a receipt and anyone
        // who can count. WooCommerce checks it; so do we, rather than trusting
        // that we were reached through WooCommerce.
        if ($nvm_candidate && hash_equals($nvm_candidate->get_order_key(), $nvm_key)) {
            $nvm_order = $nvm_candidate;
        }
    }
}
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <?php wp_head(); ?>
</head>
<body <?php body_class('nvm-skin'); ?>>
<?php wp_body_open(); ?>

<?php if (!empty($nvm_brand['show_bar'])) { NVM_Checkout_Skin::bar(); } ?>

<main class="nvm-body">
  <div class="nvm-wrap">

    <?php if ($nvm_is_receipt) : ?>

      <?php NVM_Checkout_Skin::receipt_head($nvm_order); ?>

      <?php if ($nvm_order) : ?>
        <div class="nvm-receipt-blocks">
          <?php
          /* WooCommerce's own order table, customer details and downloads.
             Rendered through wc_get_template so a gateway's hooks on
             woocommerce_order_details_after_order_table still fire. */
          wc_get_template('order/order-details.php', array('order_id' => $nvm_order->get_id()));
          ?>
        </div>
      <?php endif; ?>

      <?php NVM_Checkout_Skin::receipt_actions($nvm_order); ?>

    <?php else : ?>

      <div class="nvm-head<?php echo empty($nvm_brand['show_title']) ? ' nvm-head--bare' : ''; ?>">
        <p class="nvm-head__eyebrow"><?php echo esc_html($nvm_brand['checkout_eyebrow']); ?></p>
        <h1 class="nvm-head__title<?php echo empty($nvm_brand['show_title']) ? ' nvm-sr-only' : ''; ?>"><?php echo esc_html($nvm_brand['checkout_title']); ?></h1>
        <?php if (!empty($nvm_brand['checkout_sub'])) : ?>
          <p class="nvm-head__sub"><?php echo esc_html($nvm_brand['checkout_sub']); ?></p>
        <?php endif; ?>
      </div>

      <div class="nvm-checkout">
        <?php
        while (have_posts()) {
            the_post();
            the_content();
        }
        ?>
      </div>

    <?php endif; ?>

  </div>
</main>

<?php NVM_Checkout_Skin::foot(); ?>
<?php wp_footer(); ?>
</body>
</html>
