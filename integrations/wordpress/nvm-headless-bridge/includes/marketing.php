<?php
/** Signed storefront attribution. Existing tracking plugins remain the event owners. */
defined('ABSPATH') || exit;

final class NVM_Marketing {
    const TTL = 7776000;
    public static function boot(): void {
        add_action('init', array(self::class, 'adopt'), 1);
        add_action('template_redirect', array(self::class, 'frame'), -10001);
        add_action('rest_api_init', function () {
            register_rest_route('nvm/v1', '/marketing/config', array(
                'methods' => 'POST', 'permission_callback' => array('NVM_Headless_Bridge', 'rest_permission'),
                'callback' => array(self::class, 'config'),
            ));
        });
        add_action('wp_footer', array(self::class, 'privacy_sync'), 100);
    }
    /** Each pc_attr cookie's size cap, as the storefront writes it. */
    const COOKIE_MAX = 1536;
    const FIELDS = array('source','medium','campaign','term','content','gclid','gbraid','wbraid','dclid','fbclid','ttclid','msclkid','irclickid','oppref','ms_account','landing_page');

    /**
     * The environment a cookie belongs to: the shared cookie domain of this
     * site. The storefront binds the same value into every cookie it seals,
     * so a staging cookie never opens on production or the other way round.
     */
    private static function scope(): string {
        $host = strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST));
        if (preg_match('/(?:^|\.)devteam\.peptidescollective\.com\z/', $host)) return 'devteam.peptidescollective.com';
        if (preg_match('/(?:^|\.)peptidescollective\.com\z/', $host)) return 'peptidescollective.com';
        return $host;
    }
    private static function key(string $scope): ?string {
        $secret = NVM_Headless_Bridge::secret();
        if (strlen($secret) < 32 || !function_exists('openssl_decrypt')) return null;
        return hash_hkdf('sha256', $secret, 32, 'pc-marketing-v2|' . $scope, 'pc-marketing');
    }
    private static function b64_decode(string $value) {
        return base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    }
    private static function b64_encode(string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
    /** The same bounds the storefront enforces, applied to whatever was inside. */
    private static function validated(array $data): ?array {
        if (!is_int($data['landing_ts'] ?? null)) return null;
        $age = time() - $data['landing_ts'];
        if ($age < -60 || $age > self::TTL) return null;
        $out = array('landing_ts' => $data['landing_ts']);
        foreach (self::FIELDS as $key) {
            $v = $data[$key] ?? '';
            $cap = in_array($key, array('oppref','ttclid'), true) ? 500 : ('landing_page' === $key ? 300 : 200);
            if (!is_string($v) || strlen($v) > $cap || preg_match('/[\x00-\x1f\x7f<>]/', $v)) return null;
            $out[$key] = $v;
        }
        if (!in_array($out['ms_account'], array('', 'a', 'b'), true)) return null;
        return $out;
    }

    /**
     * Read a storefront attribution cookie (pc_attr_first, pc_attr_last,
     * pc_ref): the only way in. AES-256-GCM, mirroring
     * src/lib/marketing-attribution.ts:
     *
     *   key   = HKDF-SHA256(bridge secret, salt "pc-marketing", info "pc-marketing-v2|" . scope, 32)
     *   value = "v2." . base64url(iv[12]) . "." . base64url(ciphertext . tag[16])
     *   aad   = name . "|" . scope
     *
     * The older signed (v1) value is still read so a visitor who arrived
     * before the switch keeps their attribution.
     */
    public static function open(string $name, ?string $value = null): ?array {
        /* With a name alone (the agency contract, f1) it reads that cookie from
           this request, and is callable from `init` priority 1. */
        if (null === $value) {
            $raw = $_COOKIE[$name] ?? '';
            $value = is_string($raw) ? (string) wp_unslash($raw) : '';
            if ('' === $value) return null;
        }
        if (0 !== strpos($value, 'v2.')) return self::decode($value);
        if (strlen($value) > self::COOKIE_MAX || !preg_match('/\Av2\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{24,})\z/D', $value, $m)) return null;
        $scope = self::scope();
        $key = self::key($scope);
        if (null === $key) return null;
        $iv = self::b64_decode($m[1]);
        $blob = self::b64_decode($m[2]);
        if (false === $iv || false === $blob || 12 !== strlen($iv) || strlen($blob) < 17) return null;
        $plain = openssl_decrypt(substr($blob, 0, -16), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, substr($blob, -16), $name . '|' . $scope);
        if (false === $plain) return null;
        $data = json_decode($plain, true);
        if (!is_array($data)) return null;
        // pc_attr_* hold one landing; pc_ref holds the visits list as {"v":[{h,p,q,t},...]}.
        return 0 === strpos($name, 'pc_attr_') ? self::validated($data) : self::visits($data);
    }

    /** The parameters pc_ref may carry, in the order tpc-tracking keeps them (first-touch fixtures). */
    const REF_PARAMS = array('utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','tpc_src','tpc_med','tpc_camp','tpc_term','tpc_content','tpc_ms','gclid','gbraid','wbraid','msclkid','fbclid','oppref','ttclid','srsltid','ref');

    /** One pc_ref observation, bounded and checked, or null. */
    private static function observation($o): ?array {
        if (!is_array($o) || !is_int($o['ts'] ?? null)) return null;
        $rh = $o['rh'] ?? '';
        $path = $o['path'] ?? '';
        if (!is_string($rh) || !preg_match('/\A[a-z0-9.-]{0,100}\z/', $rh)) return null;
        if (!is_string($path) || strlen($path) > 200 || preg_match('/[\x00-\x20\x7f-\xff<>]/', $path)) return null;
        $q = array();
        $raw = is_array($o['q'] ?? null) ? $o['q'] : array();
        foreach (self::REF_PARAMS as $key) {
            $v = $raw[$key] ?? null;
            if (!is_string($v) || '' === $v) continue;
            if (strlen($v) > 100 || preg_match('/[\x00-\x1f\x7f<>]/', $v)) return null;
            $q[$key] = $v;
        }
        return array('ts' => $o['ts'], 'rh' => $rh, 'path' => $path, 'q' => $q, 'prior' => 1 === ($o['prior'] ?? 0) ? 1 : 0);
    }

    /**
     * pc_ref (task 6): raw arrival observations, never a channel.
     *   {"v":2,"first":{"ts","rh","path","q":{},"prior"},"up":[...at most 2]}
     * tpc-tracking classifies first and each up[] in time order. The first
     * release's {"v":[{h,p,q,t}]} is read into the same shape.
     */
    private static function visits(array $data): ?array {
        if (2 === ($data['v'] ?? null)) {
            $first = self::observation($data['first'] ?? null);
            if (null === $first) return null;
            $up = array();
            foreach (array_slice(is_array($data['up'] ?? null) ? $data['up'] : array(), 0, 2) as $o) {
                $clean = self::observation($o);
                if (null !== $clean) $up[] = $clean;
            }
            return array('v' => 2, 'first' => $first, 'up' => $up);
        }
        $list = array();
        foreach (array_slice(is_array($data['v'] ?? null) ? $data['v'] : array(), 0, 3) as $visit) {
            if (!is_array($visit) || !is_string($visit['q'] ?? null)) continue;
            parse_str($visit['q'], $q);
            $clean = self::observation(array('ts' => $visit['t'] ?? null, 'rh' => $visit['h'] ?? '', 'path' => $visit['p'] ?? '', 'q' => $q, 'prior' => 0));
            if (null !== $clean) $list[] = $clean;
        }
        if (!$list) return null;
        return array('v' => 2, 'first' => array_shift($list), 'up' => array_slice($list, 0, 2));
    }

    /** Seal attribution the way the storefront does, for a cookie of this name. */
    public static function seal(string $name, array $data): ?string {
        $clean = self::validated($data + array_fill_keys(self::FIELDS, ''));
        if (null === $clean) return null;
        $scope = self::scope();
        $key = self::key($scope);
        if (null === $key) return null;
        $compact = array('landing_ts' => $clean['landing_ts']);
        foreach (self::FIELDS as $field) if ('' !== $clean[$field]) $compact[$field] = $clean[$field];
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt(wp_json_encode($compact), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $name . '|' . $scope, 16);
        if (false === $cipher) return null;
        $value = 'v2.' . self::b64_encode($iv) . '.' . self::b64_encode($cipher . $tag);
        return strlen($value) <= self::COOKIE_MAX ? $value : null;
    }
    /**
     * Seal a landing and set it as the storefront does (the agency contract,
     * f1: their apex first touches). pc_attr_first and pc_attr_last only, the
     * shape seal() takes. The cookie goes on this site's shared domain when it
     * is one of the storefront's, HttpOnly, for the attribution lifetime.
     */
    public static function write(string $name, array $data): bool {
        if (!in_array($name, array('pc_attr_first', 'pc_attr_last'), true) || headers_sent()) return false;
        $value = self::seal($name, $data);
        if (null === $value) return false;
        $scope = self::scope();
        $host = strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST));
        $shared = (bool) preg_match('/(?:^|\.)peptidescollective\.com\z/', $scope) && ($host === $scope || substr($host, -strlen('.' . $scope)) === '.' . $scope);
        $_COOKIE[$name] = $value;
        return setcookie($name, $value, array(
            'expires'  => time() + self::TTL,
            'path'     => '/',
            'domain'   => $shared ? $scope : '',
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ));
    }

    /** The signed v1 format, read during the switch to v2. */
    public static function decode(string $value): ?array {
        if (strlen($value) > 3600 || !preg_match('/\A([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\z/D', $value, $m)) return null;
        $secret = NVM_Headless_Bridge::secret();
        if (strlen($secret) < 32) return null;
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', 'pc-marketing-v1.' . $m[1], $secret, true)), '+/', '-_'), '=');
        if (!hash_equals($expected, $m[2])) return null;
        $data = json_decode(base64_decode(strtr($m[1], '-_', '+/'), true), true);
        if (!is_array($data) || !is_int($data['landing_ts'] ?? null)) return null;
        $age = time() - $data['landing_ts'];
        if ($age < -60 || $age > self::TTL) return null;
        $out = array('landing_ts' => $data['landing_ts']);
        foreach (array('source','medium','campaign','term','content','gclid','gbraid','wbraid','dclid','fbclid','ttclid','msclkid','irclickid','oppref','ms_account','landing_page') as $key) {
            $v = $data[$key] ?? '';
            $cap = in_array($key, array('oppref','ttclid'), true) ? 500 : ('landing_page' === $key ? 300 : 200);
            if (!is_string($v) || strlen($v) > $cap || preg_match('/[\x00-\x1f\x7f<>]/', $v)) return null;
            $out[$key] = $v;
        }
        if (!in_array($out['ms_account'], array('', 'a', 'b'), true)) return null;
        return $out;
    }
    private static function cookie(string $name, string $value, bool $http_only = true, int $ttl = self::TTL): void {
        $_COOKIE[$name] = $value;
        if (!headers_sent()) setcookie($name, $value, array('expires' => time() + $ttl, 'path' => '/', 'secure' => is_ssl(), 'httponly' => $http_only, 'samesite' => 'Lax'));
    }
    /**
     * The storefront's cookies, into the ones WordPress's own plugins read.
     *
     * Privacy is today's behaviour (task 11, the client's GPC table):
     *  - nothing at all happens unless the storefront left one of its cookies,
     *    so while WordPress owns the traffic pages and cookies are unchanged;
     *  - GPC alone never writes capi_optout (WordPress's own code reads the
     *    signal where it matters);
     *  - no attribution cookie is ever deleted: the live site keeps
     *    first-party attribution under GPC and under the opt-out cookie.
     * The storefront's own "Do Not Sell or Share" choice becomes the live
     * site's opt-out cookie, which is the visitor's explicit choice.
     */
    public static function adopt(): void {
        if (is_admin() || wp_doing_cron()) return;
        $ours = false;
        foreach (array('pc_attr_first', 'pc_attr_last', 'pc_ref', 'pc_marketing_optout', 'nvm_shared_optout') as $name) {
            if (isset($_COOKIE[$name])) { $ours = true; break; }
        }
        if (!$ours) return;
        // An explicit www undo may clear only a native opt-out that this bridge
        // created. An independently chosen apex preference stays authoritative.
        if ('0' === ($_COOKIE['pc_marketing_optout'] ?? '') && '1' === ($_COOKIE['nvm_shared_optout'] ?? '')) {
            foreach (array('capi_optout', 'nvm_shared_optout') as $name) { self::cookie($name, '', false, -3600); unset($_COOKIE[$name]); }
        }
        $native_denied = in_array($_COOKIE['capi_optout'] ?? '', array('1','true','yes'), true);
        if ('1' === ($_COOKIE['pc_marketing_optout'] ?? '') && !$native_denied) {
            self::cookie('nvm_shared_optout', '1', false, YEAR_IN_SECONDS);
            self::cookie('capi_optout', '1', false, YEAR_IN_SECONDS);
        }
        $latest = null;
        foreach (array('pc_attr_first' => 'tpc_attribution', 'pc_attr_last' => 'tpc_last_touch') as $source => $target) {
            $raw = $_COOKIE[$source] ?? '';
            $data = is_string($raw) ? self::open($source, $raw) : null;
            if (!$data) continue;
            if ('tpc_last_touch' === $target) $latest = $data;
            $existing = isset($_COOKIE[$target]) ? json_decode(rawurldecode((string) $_COOKIE[$target]), true) : null;
            if (is_array($existing)) {
                if ('tpc_attribution' === $target) continue;
                if (($existing['landing_ts'] ?? 0) >= $data['landing_ts']) continue;
            }
            // PHP setcookie encodes once; TPC_Identity deliberately rawurldecodes the stored JSON.
            self::cookie($target, rawurlencode(wp_json_encode($data)));
            if ('tpc_last_touch' === $target) {
                if ('' !== $data['fbclid']) self::cookie('_fbc', 'fb.1.' . ($data['landing_ts'] * 1000) . '.' . $data['fbclid'], false);
                if ('' !== $data['ttclid']) self::cookie('tpc_ttclid', $data['ttclid']);
            }
        }
        if ($latest) {
            // Tagada's native script may overwrite its browser metadata on arrival.
            // Restore the signed original campaign on every native request, including
            // payment AJAX, before the gateway reads it. Purchase senders are untouched.
            $query = array();
            foreach (array('source','medium','campaign','term','content') as $field) if ('' !== $latest[$field]) $query['utm_' . $field] = $latest[$field];
            foreach (array('gclid','gbraid','wbraid','dclid','fbclid','ttclid','msclkid','irclickid','oppref') as $field) if ('' !== $latest[$field]) $query[$field] = $latest[$field];
            if ('' !== $latest['ms_account'] && '' !== $latest['msclkid']) $query['tpc_ms'] = $latest['ms_account'];
            $old = json_decode(urldecode((string) ($_COOKIE['tgd_tracking_meta'] ?? '')), true);
            $meta = array('cookies' => is_array($old['cookies'] ?? null) ? $old['cookies'] : new stdClass(), 'queryParams' => '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986));
            $encoded = rawurlencode(wp_json_encode($meta));
            if (strlen($encoded) < 3500) self::cookie('tgd_tracking_meta', $encoded, false, DAY_IN_SECONDS);
        }
    }
    /**
     * A tag ID from settings, not code (relaunch plan, task 12): the constant
     * NVM_MARKETING_<KEY>_ID in wp-config.php, else the option
     * nvm_marketing_<key>_id, else the live ID. Staging sets its test IDs
     * either way; a constant set to '' switches that tag off.
     */
    private static function tag_id(string $key, string $live): string {
        $constant = 'NVM_MARKETING_' . strtoupper($key) . '_ID';
        if (defined($constant)) return (string) constant($constant);
        $option = get_option('nvm_marketing_' . $key . '_id', '');
        return is_string($option) && '' !== $option ? $option : $live;
    }
    public static function config() {
        // Public identifiers only. Never expose a server-side access token or API secret.
        $constant = static fn($name) => defined($name) ? (string) constant($name) : '';
        return rest_ensure_response(array(
            'ga' => self::tag_id('ga', 'G-3SSFV9H1H7'), 'gtm' => self::tag_id('gtm', 'GTM-5N6284PQ'), 'uet' => self::tag_id('uet', '343272603'),
            'openai' => function_exists('tpc_openai_pixel_enabled') && tpc_openai_pixel_enabled() ? $constant('TPC_OPENAI_PIXEL_ID') : '',
            'mautic' => in_array('wp-mautic/wpmautic.php', get_option('active_plugins', array()), true) ? 'https://crm.peptidescollective.com/mtc.js' : '',
            'capi' => array(
                'endpoint' => (string) get_option('capi_endpoint_url', ''),
                'frame' => home_url('/?nvm-marketing-frame=1'),
                'publicKey' => $constant('CAPI_PUBLIC_KEY') ?: (string) get_option('capi_public_key', ''),
                'testMode' => function_exists('capi_force_test_mode') ? capi_force_test_mode() : true,
                'consentMode' => class_exists('Capi_Consent') ? Capi_Consent::consent_mode() : '',
                'cmpRequired' => class_exists('Capi_Consent') && method_exists('Capi_Consent', 'cmp_active') ? Capi_Consent::cmp_active() : false,
                'scripts' => plugins_url('capi-connector/assets/js/'),
            ),
            'tagada' => array('base' => $constant('TGDGW_APP_URL'), 'storeId' => $constant('TGDGW_STORE_ID'), 'accountId' => $constant('TGDGW_ACCOUNT_ID'), 'funnelId' => $constant('TGDGW_FUNNEL_ID'), 'stepId' => $constant('TGDGW_STEP_ID')),
            'restricted' => self::restricted_products(),
        ));
    }

    /** The agency's restricted products since Oct 5 (task 9), English and Spanish slugs. */
    const RESTRICTED_PRODUCTS = array('tesamorelin', 'tesamorelina', 'ipamorelin-tesamorelin', 'oxytocin-acetate', 'thymosin-alpha-1', 'ghrp-6', 'sermorelin');

    /**
     * The product slugs Microsoft's tag skips, served to the storefront so the
     * list changes without a release (task 9: "from marketing/config, not
     * hard-coded"). The option nvm_marketing_restricted_products (an array of
     * slugs) replaces the shipped list; a malformed entry is dropped.
     */
    private static function restricted_products(): array {
        $stored = get_option('nvm_marketing_restricted_products', null);
        $list = is_array($stored) ? $stored : self::RESTRICTED_PRODUCTS;
        $clean = array();
        foreach ($list as $slug) {
            $slug = strtolower(trim((string) $slug));
            if (preg_match('/\A[a-z0-9-]{1,80}\z/', $slug)) $clean[] = $slug;
        }
        return array_values(array_unique(array_slice($clean, 0, 100)));
    }
    public static function frame(): void {
        if (!isset($_GET['nvm-marketing-frame'])) return;
        nocache_headers();
        header('Cache-Control: private, no-store');
        header('X-Robots-Tag: noindex, nofollow');
        header('Referrer-Policy: no-referrer');
        $origins = array_values(array_filter(NVM_Headless_Bridge::frontend_urls(), static fn($v) => is_string($v) && preg_match('#^https?://[a-zA-Z0-9.:-]+$#D', $v)));
        $nonce = wp_generate_password(24, false, false);
        header_remove('X-Frame-Options');
        $endpoint = rtrim((string) get_option('capi_endpoint_url', ''), '/');
        // No arbitrary proxy destination: this bridge is for the existing collector.
        if ('https://capi.peptidescollective.com' !== $endpoint) $endpoint = '';
        header("Content-Security-Policy: default-src 'none'; script-src 'nonce-" . $nonce . "'; connect-src https://capi.peptidescollective.com; frame-ancestors 'self' " . implode(' ', $origins));
        header('Content-Type: text/html; charset=utf-8');
        $key = defined('CAPI_PUBLIC_KEY') ? (string) CAPI_PUBLIC_KEY : (string) get_option('capi_public_key', '');
        $config = wp_json_encode(array('origins' => $origins, 'endpoint' => $endpoint, 'key' => $key), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
        echo '<!doctype html><html><head><meta name="robots" content="noindex"></head><body><script nonce="' . esc_attr($nonce) . '">';
        echo 'const config=' . $config . ';';
        ?>
let session=null,identifying=null;
function denied(){return /(?:^|;\s*)(?:pc_marketing_optout|capi_optout)=(?:1|true|yes)(?:;|$)/.test(document.cookie);}
addEventListener('message',async function(e){
  if(e.source!==parent || !config.origins.includes(e.origin))return;
  const m=e.data;
  if(!m || m.channel!=='pc-marketing-v1' || typeof m.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(m.id))return;
  const reply=(status,body)=>e.source.postMessage({channel:'pc-marketing-v1',id:m.id,status,body},e.origin);
  if(denied() || !config.endpoint || !config.key){reply(403,{});return;}
  try{
    if(m.action==='identify'){
      if(!identifying)identifying=fetch(config.endpoint+'/v1/id',{credentials:'include',headers:{Authorization:'Bearer '+config.key},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(typeof b.session_id!=='string'||b.session_id.length>200)throw Error();session=b.session_id;}).catch(()=>{identifying=null;});
      await identifying;if(denied()||!session){reply(503,{});return;}reply(200,{session_id:session});return;
    }
    if(m.action!=='collect' || !session || !Array.isArray(m.events) || m.events.length!==1 || JSON.stringify(m.events).length>16384){reply(400,{});return;}
    const ev=m.events[0];
    // Under GPC the live connector still sends, with advertising off; the opt-out cookie stops it (denied above).
    if(!['page_view','view_content','add_to_cart','initiate_checkout'].includes(ev.event_name) || ev.session_id!==session || !ev.consent || typeof ev.consent.advertising!=='boolean'){reply(400,{});return;}
    const r=await fetch(config.endpoint+'/v1/collect',{method:'POST',credentials:'include',keepalive:true,headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({events:m.events}),signal:AbortSignal.timeout(5000)});
    reply(r.status,{});
  }catch(_){reply(503,{});}
});
        <?php
        echo '</script></body></html>';
        exit;
    }
    public static function privacy_sync(): void {
        // Native opt-out control also updates the shared preference for a return to www.
        // Only once the storefront serves www: until then WordPress's pages stay as they are (task 11).
        if (!NVM_Headless_Bridge::nextjs_owns_traffic()) return;
        ?>
<script id="nvm-marketing-privacy">
(function(){var h=location.hostname;if(h!=='peptidescollective.com'&&h!=='www.peptidescollective.com')return;
function sync(){var m=document.cookie.match(/(?:^|;\s*)capi_optout=([^;]*)/);if(!m)return;var off=/^(1|true|yes)$/.test(m[1]);document.cookie='pc_marketing_optout='+(off?'1':'0')+';Domain=peptidescollective.com;Path=/;Max-Age=31536000;SameSite=Lax;Secure';}
sync();document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-capi-optout]')){document.cookie='nvm_shared_optout=;Path=/;Max-Age=0;SameSite=Lax;Secure';setTimeout(sync,0);}});})();
</script>
        <?php
    }
}
NVM_Marketing::boot();
