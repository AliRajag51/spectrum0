<?php
/**
 * Maintenance mode - one switch, both halves of the shop.
 *
 * The storefront runs on Vercel and checkout runs here, so a switch that knows
 * about only one of them leaves the other open. This owns the flag, closes the
 * WooCommerce side itself, and publishes the answer so the storefront's proxy
 * can close its side from the same tick box.
 *
 * Turn it on from the Maintenance item in the admin menu, or the toggle in the admin bar.
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Maintenance
{
    const OPT      = 'nvm_maintenance';
    const OPT_NOTE = 'nvm_maintenance_note';

    public static function boot(): void
    {
        add_action('rest_api_init', array(self::class, 'register_route'));
        add_action('template_redirect', array(self::class, 'guard_store'), 0);

        add_action('admin_menu', array(self::class, 'menu'));
        add_action('admin_init', array(self::class, 'settings'));
        add_action('admin_post_nvm_maintenance_toggle', array(self::class, 'handle_toggle'));
        /* This control closes cart, checkout and account for everybody, so it
           must be explicitly requested before it sits one click away in the
           toolbar on every admin screen. */
        if ('yes' === get_option('nvm_maintenance_admin_bar', 'no')) {
            add_action('admin_bar_menu', array(self::class, 'admin_bar'), 90);
        }
    }

    public static function is_on(): bool
    {
        return (bool) get_option(self::OPT, false);
    }

    public static function note(): string
    {
        $note = trim((string) get_option(self::OPT_NOTE, ''));

        return '' !== $note
            ? $note
            : 'The shop is briefly offline while we update it. Nothing in your basket or your account is affected - please check back shortly.';
    }

    /**
     * Whoever can flip the switch can also see past it.
     *
     * No second secret to hand round, and no way to lock yourself out of your
     * own shop while you are working on it.
     */
    public static function may_bypass(): bool
    {
        return is_user_logged_in() && current_user_can('manage_woocommerce');
    }
    /* ------------------------------------------------------------- publish */

    /**
     * Public on purpose.
     *
     * All it discloses is whether the shop is open, which anyone can tell by
     * loading it. Making it public keeps the bridge key out of the edge runtime
     * and keeps the storefront's read to one cheap unauthenticated GET.
     */
    public static function register_route(): void
    {
        register_rest_route('nvm/v1', '/status', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => static function () {
                $res = rest_ensure_response(array(
                    'maintenance' => NVM_Maintenance::is_on(),
                    'note'        => NVM_Maintenance::note(),
                ));

                // Short, so the switch still feels immediate, but not zero, so a
                // busy storefront cannot hammer this on every request.
                $res->header('Cache-Control', 'public, max-age=10');

                return $res;
            },
        ));
    }

    /* --------------------------------------------------------------- guard */

    /** Close cart, checkout and the account pages on this side. */
    public static function guard_store(): void
    {
        if (!self::is_on() || self::may_bypass()) {
            return;
        }

        if (is_admin() || wp_doing_ajax() || (defined('REST_REQUEST') && REST_REQUEST)) {
            return;
        }

        if (!function_exists('is_cart')) {
            return;
        }

        // Everything customer facing here is a store page; there is no reason to
        // leave any of it open while the storefront in front of it is closed.
        if (!is_cart() && !is_checkout() && !is_account_page()) {
            return;
        }

        nocache_headers();
        do_action('litespeed_control_set_nocache', 'nvm maintenance');

        status_header(503);
        header('Retry-After: 3600');
        header('Content-Type: text/html; charset=utf-8');

        echo self::page();
        exit;
    }
    /* ---------------------------------------------------------------- page */

    /**
     * The maintenance page's palette.
     *
     * Neutral by default, matching the checkout skin's own neutral tokens, so
     * the core carries no particular shop's colours onto a customer-facing
     * page. A site supplies its brand through the filter rather than by
     * editing this file. 'ink-rgb' is the ink colour as bare RGB channels,
     * because the tints below are drawn from it.
     */
    public static function tokens(): array
    {
        return apply_filters('nvm_maintenance_tokens', array(
            'page'    => '#f5f7fa',
            'ink'     => '#1f2933',
            'ink-rgb' => '31,41,51',
            'mark-bg' => '#1f2933',
            'mark-fg' => '#ffffff',
            'rule'    => '#c3cbd4',
            'font'    => 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        ));
    }

    /**
     * The same holding page the storefront shows, so a customer bounced from
     * checkout sees one shop being worked on rather than two broken sites.
     * Self contained: no theme, no stylesheet, nothing that can be missing.
     */
    public static function page(): string
    {
        $note = esc_html(self::note());
        $name = esc_html(get_bloginfo('name'));
        $t    = self::tokens();

        return '<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Back shortly</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:32px;
     background:' . $t['page'] . ';color:' . $t['ink'] . ';font-family:' . $t['font'] . ';
     -webkit-font-smoothing:antialiased}
.box{max-width:52ch;text-align:center}
.mark{display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;
      background:' . $t['mark-bg'] . ';color:' . $t['mark-fg'] . ';margin:0 auto 26px}
.mark svg{width:26px;height:26px}
.eyebrow{display:inline-flex;align-items:center;gap:10px;margin:0 0 14px;font-size:10.5px;font-weight:600;
         letter-spacing:.16em;text-transform:uppercase;color:rgba(' . $t['ink-rgb'] . ',.55)}
.eyebrow::before{content:"";width:30px;height:1px;background:' . $t['rule'] . '}
h1{margin:0;font-size:clamp(28px,4.2vw,44px);line-height:1.06;letter-spacing:-.03em;font-weight:600;text-wrap:balance}
p{margin:16px auto 0;max-width:46ch;font-size:15px;line-height:1.65;color:rgba(' . $t['ink-rgb'] . ',.62);text-wrap:pretty}
.note{margin-top:30px;padding-top:18px;border-top:1px solid rgba(' . $t['ink-rgb'] . ',.12);font-size:12.5px;color:rgba(' . $t['ink-rgb'] . ',.45)}
</style>
</head><body>
<main class="box">
  <div class="mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>
    </svg>
  </div>
  <p class="eyebrow">Scheduled maintenance</p>
  <h1>We&rsquo;re making a few improvements.</h1>
  <p>' . $note . '</p>
  <p class="note">' . $name . '</p>
</main>
</body></html>';
    }
    /* --------------------------------------------------------------- admin */

    public static function menu(): void
    {
        // Top level, not under Settings. This is the one screen somebody needs
        // to find in a hurry and usually while something is going wrong, and
        // 'Settings -> Maintenance' is three clicks and a memory test. The
        // label carries the current state so the menu itself answers the
        // question without opening anything.
        $on = self::is_on();

        add_menu_page(
            'Maintenance',
            $on ? 'Shop CLOSED' : 'Maintenance',
            'manage_woocommerce',
            'nvm-maintenance',
            array(self::class, 'screen'),
            $on ? 'dashicons-warning' : 'dashicons-admin-tools',
            58
        );
    }

    public static function settings(): void
    {
        register_setting('nvm_maintenance', self::OPT, array(
            'type'              => 'boolean',
            'sanitize_callback' => static fn($v) => (bool) $v,
            'default'           => false,
        ));

        register_setting('nvm_maintenance', self::OPT_NOTE, array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
            'default'           => '',
        ));
    }

    public static function screen(): void
    {
        $on = self::is_on();
        ?>
        <div class="wrap">
          <h1>Maintenance</h1>

          <p style="max-width:70ch">
            One switch for the whole shop. It closes the storefront and this
            site's cart, checkout and account pages together, so there is no
            half-open state where somebody can still reach checkout.
          </p>

          <p style="padding:12px 16px;border-left:4px solid <?php echo $on ? '#b4423a' : '#00a32a'; ?>;background:#fff;max-width:70ch">
            <strong><?php echo $on ? 'The shop is CLOSED to customers.' : 'The shop is open.'; ?></strong><br>
            <?php esc_html_e('You can still browse it yourself while it is closed, because you can edit it.', 'nvm'); ?>
          </p>

          <form method="post" action="options.php">
            <?php settings_fields('nvm_maintenance'); ?>
            <table class="form-table" role="presentation">
              <tr>
                <th scope="row">Maintenance mode</th>
                <td>
                  <label>
                    <input type="checkbox" name="<?php echo esc_attr(self::OPT); ?>" value="1" <?php checked($on); ?>>
                    Close the shop to customers
                  </label>
                </td>
              </tr>
              <tr>
                <th scope="row"><label for="nvm_note">Message</label></th>
                <td>
                  <textarea id="nvm_note" name="<?php echo esc_attr(self::OPT_NOTE); ?>" rows="3" class="large-text"><?php echo esc_textarea((string) get_option(self::OPT_NOTE, '')); ?></textarea>
                  <p class="description">Shown on the holding page. Leave empty for the default.</p>
                </td>
              </tr>
            </table>
            <?php submit_button(); ?>
          </form>
        </div>
        <?php
    }
    /* ----------------------------------------------------------- admin bar */

    /**
     * One click, from anywhere in wp-admin or the front end.
     *
     * The settings screen exists for the message; this exists for the moment
     * you actually need it, when hunting through menus is the last thing you
     * want to be doing.
     */
    public static function admin_bar($bar): void
    {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        $on = self::is_on();

        $bar->add_node(array(
            'id'    => 'nvm-maintenance',
            'title' => $on ? 'Shop CLOSED' : 'Shop open',
            'href'  => admin_url('admin.php?page=nvm-maintenance'),
            'meta'  => array('title' => 'Maintenance mode'),
        ));

        $bar->add_node(array(
            'parent' => 'nvm-maintenance',
            'id'     => 'nvm-maintenance-toggle',
            'title'  => $on ? 'Reopen the shop' : 'Close the shop',
            'href'   => wp_nonce_url(
                admin_url('admin-post.php?action=nvm_maintenance_toggle'),
                'nvm_maintenance_toggle'
            ),
        ));
    }

    /** A state change, so it is a POST-equivalent behind a nonce, not a bare link. */
    public static function handle_toggle(): void
    {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Not allowed.', '', array('response' => 403));
        }

        check_admin_referer('nvm_maintenance_toggle');

        update_option(self::OPT, !self::is_on());

        wp_safe_redirect(wp_get_referer() ?: admin_url('admin.php?page=nvm-maintenance'));
        exit;
    }
}
