<?php
/**
 * Checkout and order-received skin.
 *
 * Replaces the theme's rendering of those two pages with a standalone document:
 * a wordmark, a way to reach a human, the WooCommerce form, and nothing else.
 *
 * Written to be carried to the next site. Everything that makes it look like
 * THIS brand is a token in defaults() below, and every token can be overridden
 * three ways without touching a line of this file or the stylesheet:
 *
 *   1. the `nvm_checkout_skin_tokens` filter  (a child plugin or theme)
 *   2. the `nvm_checkout_skin_tokens` option  (per site, no code)
 *   3. editing defaults() itself               (a new house style)
 *
 * The same goes for the wordmark, the contact link and the page copy, which
 * live in brand().
 *
 * Deliberately a template takeover rather than CSS that hides the theme's
 * header and footer. Hiding chrome leaves it in the document, still loading its
 * images and scripts, still reachable by keyboard, and still liable to reappear
 * the day the theme changes a class name. Not rendering it is simply true.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Checkout_Skin
{
    const OPT_TOKENS = 'nvm_checkout_skin_tokens';
    const OPT_BRAND  = 'nvm_checkout_skin_brand';
    const OPT_ENABLED = 'nvm_bridge_checkout_skin';
    const HANDLE     = 'nvm-checkout-skin';

    public static function skin_enabled(): bool
    {
        return (bool) apply_filters(
            'nvm_checkout_skin_enabled',
            'yes' === get_option(self::OPT_ENABLED, 'no')
        );
    }

    public static function boot(): void
    {
        if (!self::skin_enabled()) {
            return;
        }

        add_filter('template_include', array(self::class, 'take_over'), 99);
        add_action('wp_enqueue_scripts', array(self::class, 'enqueue'), 20);

        // Wrap the two halves of the form so the layout has something to grid.
        //
        // WooCommerce renders customer details, the review heading and the review
        // table as three siblings of one <form>. Gridding them directly means the
        // details column has to span two rows, and a spanning item's height is
        // shared across the content-sized tracks it spans — which pushed the
        // review table a couple of hundred pixels below its own heading. These
        // four hooks exist for precisely this, and give the grid two children
        // instead of three, which needs no spanning at all.
        add_action('woocommerce_checkout_before_customer_details', array(self::class, 'open_col_form'));
        add_action('woocommerce_checkout_after_customer_details', array(self::class, 'close_col'));
        add_action('woocommerce_checkout_before_order_review_heading', array(self::class, 'open_col_side'));
        add_action('woocommerce_checkout_after_order_review', array(self::class, 'close_col'));

        // Line items: a thumbnail instead of the variation list.
        add_filter('woocommerce_get_item_data', array(self::class, 'drop_variation_meta'), 10, 1);
        add_filter('woocommerce_cart_item_name', array(self::class, 'item_thumbnail'), 10, 2);
    }

    /** Only these two pages, and never inside the admin or a REST call. */
    public static function applies(): bool
    {
        if (is_admin() || wp_doing_ajax() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return false;
        }

        if (!function_exists('is_checkout')) {
            return false;
        }

        // is_checkout() is true for order-received as well; both are ours.
        $applies = is_checkout() || is_order_received_page();

        return (bool) apply_filters('nvm_checkout_skin_applies', $applies);
    }

    public static function take_over($template)
    {
        if (!self::applies()) {
            return $template;
        }

        $own = plugin_dir_path(__FILE__) . '../templates/checkout-skin.php';

        return file_exists($own) ? $own : $template;
    }

    /* ------------------------------------------------------------- tokens */

    /**
     * The whole visual identity, as one flat list.
     *
     * Colour first, then type, then metrics. A new site normally changes the
     * first block and one or two sizes; that is the entire brief for reuse.
     */
    public static function defaults(): array
    {
        return array(
            /* -- colour ------------------------------------------------- */
            // Neutral defaults. The site plugin applies its own brand tokens.
            'brand'         => '#1f2933',
            'brand-hover'   => '#323f4b',
            'brand-shadow'  => 'rgba(31,41,51,.75)',
            'on-brand'      => '#ffffff',
            'on-brand-soft' => 'rgba(255,255,255,.72)',
            'accent'        => '#1f2933',
            'accent-deep'   => '#111827',
            'accent-line'   => 'rgba(31,41,51,.22)',
            'ink'           => '#1f2933',
            'muted'         => '#52606d',
            'muted-soft'    => 'rgba(82,96,109,.72)',
            'page'          => '#f5f7fa',
            'surface'       => '#ffffff',
            'tint'          => 'rgba(31,41,51,.05)',
            'line'          => '#dbe1e8',
            'line-strong'   => '#c3cbd4',
            'focus'         => 'rgba(31,41,51,.14)',
            'danger'        => '#b4423a',

            /* -- type ----------------------------------------------------- */
            'font'         => 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            'font-display' => 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            'size'      => '15px',
            'size-lg'   => '15.5px',
            'size-sm'   => '13.5px',
            'size-xs'   => '10.5px',
            'h1'        => 'clamp(30px, 4.2vw, 46px)',
            'h3'        => 'clamp(17px, 1.7vw, 20px)',
            'total'     => 'clamp(18px, 2vw, 22px)',
            'logo-text' => '20px',

            /* -- metrics -------------------------------------------------- */
            'maxw'         => '1180px',
            'gut'          => 'clamp(18px, 4vw, 44px)',
            'gap'          => 'clamp(16px, 2vw, 26px)',
            'pad'          => 'clamp(18px, 2.4vw, 30px)',
            // The order summary is a list of figures, not a form, and reads
            // tighter than the fields beside it.
            'pad-side'     => 'clamp(16px, 1.6vw, 22px)',
            'space'        => '18px',
            'space-lg'     => 'clamp(26px, 4vh, 44px)',
            'space-xl'     => 'clamp(36px, 6vh, 70px)',
            // DESIGN.md rounded: card 16, control 10, seal 999.
            'radius'       => '16px',
            'radius-field' => '10px',
            'radius-pill'  => '999px',
            'field-h'      => '50px',
            'btn-h'        => '48px',
            'btn-h-lg'     => '56px',
            'bar-h'        => '68px',
            'logo-h'       => '26px',
            'thumb'        => '46px',
        );
    }

    public static function tokens(): array
    {
        $stored = get_option(self::OPT_TOKENS, array());
        $tokens = array_merge(self::defaults(), is_array($stored) ? $stored : array());

        return apply_filters('nvm_checkout_skin_tokens', $tokens);
    }

    /** Wordmark, contact link and the words on both pages. */
    public static function brand(): array
    {
        $frontend = class_exists('NVM_Headless_Bridge')
            ? NVM_Headless_Bridge::frontend_url()
            : home_url();

        $defaults = array(
            // The bar is off by default: on a page whose whole job is one form,
            // a full-width branded header is the largest thing on screen and the
            // least useful. Set true to bring it back.
            'show_bar'  => false,
            // The <h1> still renders when this is false — it is moved out of
            // sight, not removed. A page with no heading is worse for a screen
            // reader and for search than one with a heading you cannot see, and
            // 'hide' only ever meant stop showing it.
            'show_title' => false,
            'name'      => get_bloginfo('name'),
            'logo'      => '',
            'home'      => $frontend,
            'help_url'  => $frontend . NVM_Headless_Bridge::path('contact'),
            'help_label'=> 'Need help?',

            'checkout_eyebrow' => 'Secure checkout',
            'checkout_title'   => 'Checkout',
            'checkout_sub'     => 'Your details are sent over an encrypted connection and are only ever used to fulfil this order.',

            'receipt_eyebrow'  => 'Order confirmed',
            'receipt_title'    => 'Thank you — your order is in.',
            'receipt_sub'      => 'A confirmation is on its way to your inbox. You can keep this page for your records.',

            // Empty by default: a compliance line belongs to the shop that is
            // legally required to show it, not to every shop using this core.
            'footnote'         => '',
        );

        $stored = get_option(self::OPT_BRAND, array());
        $brand  = array_merge($defaults, is_array($stored) ? $stored : array());

        return apply_filters('nvm_checkout_skin_brand', $brand);
    }

    /* ---------------------------------------------------------- stylesheet */

    public static function enqueue(): void
    {
        if (!self::applies()) {
            return;
        }

        // __DIR__ is includes/, so the plugin root is one level up. Deriving the
        // URL from includes/ pointed the stylesheet at includes/assets/, which
        // 404s — the page then renders as unstyled markup rather than failing
        // loudly, which is the worst way for a stylesheet to be wrong.
        $root = dirname(__DIR__);
        $file = $root . '/assets/checkout-skin.css';
        $url  = plugins_url('assets/checkout-skin.css', $root . '/nvm-headless-bridge.php');

        // The token font has to exist on this side too. WordPress is not the
        // storefront and does not inherit its webfont, so a token naming a family
        // nobody loaded silently falls back to the theme's serif.
        $webfont = apply_filters('nvm_checkout_skin_webfont', '');

        if ($webfont) {
            wp_enqueue_style(self::HANDLE . '-font', $webfont, array(), null);
        }

        wp_enqueue_style(
            self::HANDLE,
            $url,
            array(),
            file_exists($file) ? (string) filemtime($file) : null
        );

        $css = '';
        foreach (self::tokens() as $key => $value) {
            $css .= '--nvm-' . $key . ':' . $value . ';';
        }

        wp_add_inline_style(self::HANDLE, ':root{' . $css . '}');
    }

    /* -------------------------------------------------------------- parts */

    public static function bar(): void
    {
        $brand = self::brand();
        ?>
        <header class="nvm-bar">
          <div class="nvm-wrap nvm-bar__in">
            <a class="nvm-bar__mark" href="<?php echo esc_url($brand['home']); ?>">
              <?php if (!empty($brand['logo'])) : ?>
                <img src="<?php echo esc_url($brand['logo']); ?>" alt="<?php echo esc_attr($brand['name']); ?>">
              <?php else : ?>
                <span class="nvm-bar__mark-text"><?php echo esc_html($brand['name']); ?></span>
              <?php endif; ?>
            </a>
            <?php if (!empty($brand['help_url'])) : ?>
              <a class="nvm-bar__help" href="<?php echo esc_url($brand['help_url']); ?>">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <?php echo esc_html($brand['help_label']); ?>
              </a>
            <?php endif; ?>
          </div>
        </header>
        <?php
    }

    public static function foot(): void
    {
        $brand = self::brand();
        ?>
        <footer class="nvm-foot">
          <div class="nvm-wrap nvm-foot__in">
            <span><?php echo esc_html($brand['footnote']); ?></span>
            <span class="nvm-foot__right">
              <?php if (!empty($brand['help_url'])) : ?>
                <a class="nvm-foot__help" href="<?php echo esc_url($brand['help_url']); ?>"><?php echo esc_html($brand['help_label']); ?></a>
              <?php endif; ?>
              <span>&copy; <?php echo esc_html(date('Y')); ?> <?php echo esc_html($brand['name']); ?></span>
            </span>
          </div>
        </footer>
        <?php
    }

    /** The confirmation head: the fact that it worked, said once and loudly. */
    public static function receipt_head($order): void
    {
        $brand = self::brand();
        ?>
        <div class="nvm-receipt">
          <div class="nvm-receipt__tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </div>
          <h1 class="nvm-receipt__title"><?php echo esc_html($brand['receipt_title']); ?></h1>
          <p class="nvm-receipt__sub"><?php echo esc_html($brand['receipt_sub']); ?></p>

          <?php if ($order) : ?>
            <ul class="woocommerce-thankyou-order-details order_details">
              <li><?php esc_html_e('Order number', 'woocommerce'); ?><strong><?php echo esc_html($order->get_order_number()); ?></strong></li>
              <li><?php esc_html_e('Date', 'woocommerce'); ?><strong><?php echo esc_html(wc_format_datetime($order->get_date_created())); ?></strong></li>
              <?php if ($order->get_billing_email()) : ?>
                <li><?php esc_html_e('Email', 'woocommerce'); ?><strong><?php echo esc_html($order->get_billing_email()); ?></strong></li>
              <?php endif; ?>
              <li><?php esc_html_e('Total', 'woocommerce'); ?><strong><?php echo wp_kses_post($order->get_formatted_order_total()); ?></strong></li>
              <?php if ($order->get_payment_method_title()) : ?>
                <li><?php esc_html_e('Payment method', 'woocommerce'); ?><strong><?php echo esc_html($order->get_payment_method_title()); ?></strong></li>
              <?php endif; ?>
            </ul>
          <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Optional receipt chrome. Both destinations return through WordPress so
     * the storefront adopts the post-order WooCommerce session before routing.
     */
    public static function receipt_actions($order): void
    {
        if (!NVM_Headless_Bridge::receipt_actions_enabled() || !($order instanceof WC_Order)) {
            return;
        }

        $settings       = NVM_Headless_Bridge::receipt_action_settings();
        $order_id       = (string) $order->get_id();
        $order_user_id  = (int) $order->get_user_id();
        $primary_path   = NVM_Headless_Bridge::safe_path(str_replace('{order_id}', $order_id, $settings['primary_path']));
        $secondary_path = NVM_Headless_Bridge::safe_path(str_replace('{order_id}', $order_id, $settings['secondary_path']));
        $primary_url    = add_query_arg(
            array(
                'nvm-cart-return' => 1,
                'nvm-to'          => $primary_path,
            ),
            home_url('/')
        );
        $show_secondary = is_user_logged_in()
            && $order_user_id > 0
            && $order_user_id === get_current_user_id();

        $secondary_url = $show_secondary
            ? add_query_arg(
                array(
                    'nvm-cart-return' => 1,
                    'nvm-to'          => $secondary_path,
                ),
                home_url('/')
            )
            : '';
        ?>
        <div class="nvm-receipt__actions">
          <a class="nvm-btn" href="<?php echo esc_url($primary_url); ?>"><?php echo esc_html($settings['primary_label']); ?></a>
          <?php if ('' !== $secondary_url) : ?>
            <a class="nvm-btn nvm-btn--ghost" href="<?php echo esc_url($secondary_url); ?>"><?php echo esc_html($settings['secondary_label']); ?></a>
          <?php endif; ?>
        </div>
        <?php
    }
    /* --------------------------------------------------------- form columns */

    public static function open_col_form(): void { echo '<div class="nvm-col-form">'; }
    public static function open_col_side(): void { echo '<div class="nvm-col-side">'; }
    public static function close_col(): void { echo '</div>'; }
    /* ----------------------------------------------------------- line items */

    /**
     * Drop the "Pack: Single Vial / Vial Size: 10mg" list from the review table.
     *
     * Filtering woocommerce_get_item_data rather than hiding the markup, because
     * this filter feeds the cart and checkout display only. The same information
     * on an order reaches emails through a different filter, and stripping that
     * one would quietly take the size off the customer's receipt.
     */
    public static function drop_variation_meta($data)
    {
        if (function_exists('is_checkout') && is_checkout()) {
            return array();
        }

        return $data;
    }

    /**
     * A small product image on the checkout line.
     *
     * Checkout only. The cart is the storefront's own page and never renders
     * through here, and the order-received table is a record rather than a
     * shopfront - a thumbnail earns its place while somebody is still deciding,
     * not after they have paid.
     */
    public static function item_thumbnail($name, $cart_item)
    {
        if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page()) {
            return $name;
        }

        $product = isset($cart_item['data']) ? $cart_item['data'] : null;

        if (!$product instanceof WC_Product) {
            return $name;
        }

        $image = $product->get_image('woocommerce_gallery_thumbnail', array(
            'class'   => 'nvm-line__thumb',
            'loading' => 'lazy',
            'alt'     => '',
        ));

        if (!$image) {
            return $name;
        }

        // $name is already escaped markup - usually an anchor - so it is wrapped
        // rather than rebuilt.
        return '<span class="nvm-line">' . $image . '<span class="nvm-line__name">' . $name . '</span></span>';
    }
    /*
     * There is deliberately no code here appending the size to the name.
     *
     * WooCommerce already returns a variation's name with its attributes on it
     * - "GLP-3 RT - 10mg" - so the Pack/Vial Size list underneath was the
     * duplicate, not the name. Adding a suffix as well produced
     * "GLP-3 RT - 10mg - 10mg". Removing the list is the whole fix.
     */

}
