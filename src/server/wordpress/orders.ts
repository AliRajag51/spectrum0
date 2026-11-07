import "server-only";

import { z } from "zod";
import { wordPressStoreUrl } from "@/lib/wp-urls";
import { createWooClient, wooConfig } from "@/server/wordpress/client";

const wooOrder = z
  .object({
    id: z.number().int().positive(),
    number: z.string().optional(),
    status: z.string(),
    total: z.string().optional(),
    currency: z.string().optional(),
    payment_url: z.string().optional(),
  })
  .passthrough();

/* Orders are created by WooCommerce's own checkout now that the storefront
   hands over a real Store API cart, so nothing here writes one. What remains is
   the one read the account area needs: the link that lets a customer finish
   paying an order they left pending. */
export class WooCommerceOrderGateway {
  private readonly client;
  private readonly baseUrl: string;

  constructor() {
    const config = wooConfig();
    if (!config) throw new Error("WooCommerce order configuration is incomplete.");
    this.baseUrl = config.baseUrl;
    this.client = createWooClient(config);
  }

  /**
   * The pay-for-order URL WooCommerce mints for an existing order.
   *
   * The URL carries the order key, so it is a credential: only call this after
   * the bridge has confirmed the order belongs to the session's customer. This
   * reads with the store-wide REST key, which cannot tell one customer from
   * another and must never be the thing that decides who may see an order.
   */
  async getPaymentUrl(orderId: number) {
    const payload = await this.client.request(
      `/wp-json/wc/v3/orders/${orderId}`,
      {},
      (value) => wooOrder.parse(value),
    );
    return wordPressStoreUrl(payload.payment_url, this.baseUrl);
  }
}
