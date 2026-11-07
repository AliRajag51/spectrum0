<?php
/**
 * "Card (storefront)": the payment method of orders paid on the storefront.
 *
 * Takes no payment itself. The storefront charges the card through Tagada
 * after WooCommerce has made the order, then reports it through
 * `/nvm/v1/checkout/complete`. So this only records the order as awaiting that
 * payment, assigns it to the storefront's customer, and keeps the basket: if
 * the card is declined, the customer is still looking at it.
 *
 * Offered only to the storefront server's checkout request
 * (NVM_Storefront_Checkout::customer_id() > 0), so it never appears on the
 * WordPress checkout page or to any browser.
 *
 * @package NVM_Headless_Bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

class NVM_Storefront_Card_Gateway extends WC_Payment_Gateway
{
    public function __construct()
    {
        $this->id                 = NVM_Storefront_Checkout::GATEWAY_ID;
        $this->method_title       = 'Card (storefront)';
        $this->method_description = 'Card payments taken on the headless storefront through Tagada. Not shown on the WordPress checkout.';
        $this->title              = 'Credit / debit card';
        $this->has_fields         = false;
        $this->supports           = array('products');
        // Not a setting: the storefront depends on it being present.
        $this->enabled = 'yes';
    }

    public function is_available()
    {
        return NVM_Storefront_Checkout::customer_id() > 0;
    }

    /**
     * Called by the Store API checkout once the order exists.
     *
     * @param int $order_id
     * @return array
     */
    public function process_payment($order_id)
    {
        $order       = wc_get_order($order_id);
        $customer_id = NVM_Storefront_Checkout::customer_id();
        if (!$order instanceof WC_Order || $customer_id < 1) {
            return array('result' => 'failure');
        }

        $order->set_customer_id($customer_id);
        // Store API hands a legacy gateway its `payment_data` as POST fields.
        $opt_in = isset($_POST['nvm_marketing_opt_in']) && '1' === (string) wp_unslash($_POST['nvm_marketing_opt_in']); // phpcs:ignore WordPress.Security.NonceVerification
        $order->update_meta_data(NVM_Storefront_Checkout::META_OPT_IN, $opt_in ? 'yes' : 'no');
        /* The site's own consent record, in the keys its WordPress checkout
           field writes (Peptides Collective: tpc-store's `_tpc_research_updates`
           with when and from where), so the account sync that reads it treats a
           storefront order the same. Empty filter value: not written. */
        $consent = (string) apply_filters('nvm_storefront_consent_order_meta', '_tpc_research_updates');
        if ('' !== $consent) {
            $order->update_meta_data($consent, $opt_in ? '1' : '0');
            $order->update_meta_data($consent . '_at', current_time('mysql', true) . ' UTC');
            if ('' !== (string) $order->get_customer_ip_address()) {
                $order->update_meta_data($consent . '_ip', (string) $order->get_customer_ip_address());
            }
        }
        $order->update_status('pending', 'Awaiting card payment on the storefront.');
        $order->save();

        // No redirect: the storefront stays on its own page and charges the card.
        return array('result' => 'success', 'redirect' => '');
    }
}
