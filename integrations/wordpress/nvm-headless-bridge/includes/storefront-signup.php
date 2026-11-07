<?php
/**
 * Sign-ups started on the storefront: the research declaration, and
 * "Continue with Facebook".
 *
 * The research declaration (payment processor rules R1–R4) is the one every
 * new account makes on the WordPress gate: a research status, the 21+
 * qualified-researcher statement and acceptance of the policies. It is saved
 * with the gate's own TPC_Gate::save_declaration when that class is loaded, so
 * a storefront sign-up writes exactly the records a gate sign-up writes; the
 * same user meta is written directly where the gate is not installed.
 *
 * Facebook sign-in follows the Meta Sign-In Handoff: the storefront does the
 * OAuth exchange on its server and sends the verified Facebook id, name and
 * email here. Only a Facebook id already linked to an account, or a brand-new
 * email with the declaration on record, signs anyone in. An email that already
 * has an account is never signed in through Facebook.
 *
 * Every route answers only to the storefront server (the bridge key).
 *
 * @package NVM_Headless_Bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

final class NVM_Storefront_Signup
{
    /** The gate's statuses, used when the gate is not installed. */
    const STATUSES = array('independent-researcher', 'md', 'research-foundation', 'research-institute', 'analytical-laboratory');

    /** The gate's user meta and declaration version, likewise. */
    const META_STATUS  = 'tpc_research_status';
    const META_AT      = 'tpc_research_declared_at';
    const META_VERSION = 'tpc_research_decl_version';
    const META_SOURCE  = 'tpc_research_decl_source';
    const META_LANG    = 'tpc_research_decl_lang';
    const DECL_VERSION = '2026-09-23';

    /** The Facebook id an account signs in with. */
    const META_FACEBOOK = 'tpc_fb_id';

    public static function boot(): void
    {
        add_action('rest_api_init', array(self::class, 'register_routes'));
    }

    public static function register_routes(): void
    {
        register_rest_route(NVM_Headless_Bridge::REST_NS, '/me/declaration', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_declaration'),
            'permission_callback' => array('NVM_Headless_Bridge', 'rest_permission'),
        ));
        register_rest_route(NVM_Headless_Bridge::REST_NS, '/facebook-signin', array(
            'methods'             => 'POST',
            'callback'            => array(self::class, 'rest_facebook'),
            'permission_callback' => array('NVM_Headless_Bridge', 'rest_permission'),
        ));
    }

    /* ------------------------------------------------------- declaration */

    private static function statuses(): array
    {
        return (class_exists('TPC_Gate') && defined('TPC_Gate::STATUSES')) ? TPC_Gate::STATUSES : self::STATUSES;
    }

    /**
     * The posted declaration, checked like the gate checks its form, or null
     * when any answer is missing. `$raw` is the request's `declaration` object.
     *
     * @param mixed $raw
     */
    public static function declaration($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }
        $status = isset($raw['status']) && is_string($raw['status']) ? sanitize_key($raw['status']) : '';
        if (!in_array($status, self::statuses(), true) || true !== ($raw['attest'] ?? null) || true !== ($raw['accept'] ?? null)) {
            return null;
        }
        $lang = isset($raw['lang']) && 'es' === $raw['lang'] ? 'es' : 'en';
        return array('status' => $status, 'lang' => $lang);
    }

    /** Record it on the account, through the gate when the gate is there. */
    public static function save_declaration(int $user_id, array $declaration, string $source): void
    {
        if ($user_id <= 0) {
            return;
        }
        if (class_exists('TPC_Gate') && method_exists('TPC_Gate', 'save_declaration')) {
            TPC_Gate::save_declaration($user_id, $declaration['status'], $source, $declaration['lang']);
            return;
        }
        update_user_meta($user_id, self::META_STATUS, $declaration['status']);
        update_user_meta($user_id, self::META_AT, gmdate('Y-m-d H:i:s'));
        update_user_meta($user_id, self::META_VERSION, self::DECL_VERSION);
        update_user_meta($user_id, self::META_SOURCE, $source);
        update_user_meta($user_id, self::META_LANG, $declaration['lang']);
    }

    public static function has_declaration(int $user_id): bool
    {
        return '' !== (string) get_user_meta($user_id, self::META_STATUS, true);
    }

    /** A signed-in customer's declaration, made once (after a Google sign-up, for one). */
    public static function rest_declaration(WP_REST_Request $request)
    {
        $user_id = (int) wp_validate_auth_cookie((string) $request->get_param('auth'), 'logged_in');
        if ($user_id < 1) {
            return new WP_Error('nvm_unauthenticated', 'Not signed in.', array('status' => 401));
        }
        $declaration = self::declaration($request->get_param('declaration'));
        if (null === $declaration) {
            return new WP_Error('nvm_declaration_required', 'Answer the research questions to continue.', array('status' => 400));
        }
        // Made once: an account that already declared keeps its record.
        if (!self::has_declaration($user_id)) {
            self::save_declaration($user_id, $declaration, (string) ($request->get_param('source') === 'storefront-google' ? 'storefront-google' : 'storefront-step'));
        }
        return rest_ensure_response(array('declared' => true));
    }

    /* ---------------------------------------------------------- Facebook */

    /** The account linked to this Facebook id, or 0. */
    private static function linked_user(string $facebook_id): int
    {
        $users = get_users(array(
            'meta_key'   => self::META_FACEBOOK,
            'meta_value' => $facebook_id,
            'number'     => 2,
            'fields'     => 'ID',
        ));
        // Two accounts on one Facebook id is a data fault, not a sign-in.
        return 1 === count($users) ? (int) $users[0] : 0;
    }

    /**
     * Sign in or sign up with a Facebook identity the storefront verified.
     *
     * Answers `result`:
     *  - `signed_in`: a session, with `new_account` when one was just created;
     *  - `existing_email`: that email already has an account, which is never
     *    signed in through Facebook (the customer signs in with their email);
     *  - `need_more`: `missing` lists what to ask for (`email`, `declaration`).
     */
    public static function rest_facebook(WP_REST_Request $request)
    {
        $facebook_id = (string) $request->get_param('facebook_id');
        if (!preg_match('/\A[0-9]{1,32}\z/', $facebook_id)) {
            return new WP_Error('nvm_bad_request', 'Invalid Facebook identity.', array('status' => 400));
        }
        if (NVM_Headless_Bridge::attempt_limited_public('facebook', $facebook_id, 10)) {
            return new WP_Error('nvm_throttled', 'Too many attempts. Wait a few minutes and try again.', array('status' => 429));
        }

        $linked = self::linked_user($facebook_id);
        if ($linked > 0) {
            error_log('[nvm-bridge] facebook: signin uid=' . $linked);
            $session = NVM_Headless_Bridge::issue_session_public($linked, (string) $request->get_param('cart_token'));
            NVM_Headless_Bridge::session_issued($linked, 'signin');
            return rest_ensure_response(array(
                'result'      => 'signed_in',
                'new_account' => false,
                'session'     => $session,
            ));
        }

        $email       = sanitize_email((string) $request->get_param('email'));
        $declaration = self::declaration($request->get_param('declaration'));
        $missing     = array();
        if (!is_email($email)) {
            $missing[] = 'email';
        } elseif (email_exists($email)) {
            error_log('[nvm-bridge] facebook: existing-email');
            return rest_ensure_response(array('result' => 'existing_email'));
        }
        if (null === $declaration) {
            $missing[] = 'declaration';
        }
        if ($missing) {
            return rest_ensure_response(array('result' => 'need_more', 'missing' => $missing));
        }

        if ('yes' !== get_option('woocommerce_enable_myaccount_registration')) {
            return new WP_Error('nvm_registration_closed', 'Account registration is not open.', array('status' => 403));
        }
        NVM_Headless_Bridge::mark_storefront_signup('facebook');

        $name  = trim(sanitize_text_field((string) $request->get_param('name')));
        $parts = '' === $name ? array('', '') : array_pad(explode(' ', $name, 2), 2, '');
        $user_id = NVM_Headless_Bridge::create_customer_public($email, (string) $parts[0], (string) $parts[1]);
        if (is_wp_error($user_id)) {
            return new WP_Error('nvm_register_failed', $user_id->get_error_message(), array('status' => 400));
        }
        update_user_meta((int) $user_id, self::META_FACEBOOK, $facebook_id);
        self::save_declaration((int) $user_id, $declaration, 'gate-facebook');
        error_log('[nvm-bridge] facebook: signup uid=' . (int) $user_id);

        $session = NVM_Headless_Bridge::issue_session_public((int) $user_id, (string) $request->get_param('cart_token'));
        NVM_Headless_Bridge::session_issued((int) $user_id, 'register');

        return rest_ensure_response(array(
            'result'      => 'signed_in',
            'new_account' => true,
            'session'     => $session,
        ));
    }
}
