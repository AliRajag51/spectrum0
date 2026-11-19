# Domain routing, SEO and contact mail (live since 2026-11-19)

WordPress (apex `spectrumbiosciences.shop`, Hostinger) hands customer pages to the
Next.js storefront (`www.spectrumbiosciences.shop`, Vercel).

## Redirects
- Turned on by option `nvm_bridge_traffic_owner = nextjs` (NVM Headless Core's
  `NVM_Storefront_Router`). Roll back: set it to `wordpress`.
- `mu-plugins/spectrum-seo-redirects.php` (installed in `wp-content/mu-plugins`):
  - upgrades public-page hops to **301** (cart/account/checkout stay 302);
  - forwards apex 404s (e.g. `/about/`, `/contact-us/`) to www with a 301;
  - serves a crawlable `robots.txt` so search engines see the 301s.
- WordPress keeps: checkout, order-pay/received, wp-admin, wp-login, wp-json,
  `wc-api`, password-reset/sign-in keys.

## Contact form + SMTP
- Storefront `/contact` → bridge `nvm/v1/site/contact` → `wp_mail`.
- `mu-plugins/spectrum-contact-mail.php` defines the helpers Spectrum Commerce
  needs (they were missing, so every submission returned 503). Recipient =
  option `spectrum_contact_recipient`, else `admin_email`. Turnstile only
  enforced if option `spectrum_turnstile_secret` is set.
- FluentSMTP 2.4.5 installed + active, email logging on, **no connection yet**
  (mail falls back to PHP mail until one is saved).
- To finish: Settings → FluentSMTP → Add connection → "Other SMTP":
  host `smtp.hostinger.com`, port `465`, SSL, auth on, username = mailbox,
  password from client, From = the mailbox, name "Spectrum Biosciences".
  Send a test email, then optionally set `spectrum_contact_recipient`.
