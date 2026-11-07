import "server-only";

import { z } from "zod";
import {
  stockAlertMessage,
  stockAlertStatus,
  stockAlertTarget,
  type StockAlertInput,
  type StockAlertResult,
} from "@/lib/stock-alerts";
import { getCatalog } from "@/server/catalog";
import { CustomerFacingError } from "@/server/errors";
import {
  createWooClient,
  wooConfig,
  WordPressRequestError,
} from "@/server/wordpress/client";

/* Filing a restock alert with WooCommerce.
 *
 * The site plugin keeps the list and sends the email, because it is the thing
 * that sees a stock status change the moment it happens. This side only checks
 * the request against the catalogue and carries it over on the store-wide
 * credential, which never reaches a browser. The route lives under `wc-tpc/v1`
 * so WooCommerce applies its own REST authentication to it. */

const NOT_CONNECTED =
  "Restock alerts are not connected on this deployment yet.";

const pluginAnswer = z.object({ status: stockAlertStatus });

export async function requestStockAlert(
  input: StockAlertInput,
): Promise<StockAlertResult> {
  const catalog = await getCatalog();
  const product = catalog.find((candidate) => candidate.id === input.productId);
  const variation = product?.variations.find(
    (candidate) => candidate.id === input.variationId,
  );
  if (!product || !variation) {
    throw new CustomerFacingError("That product is no longer available.", 404);
  }

  /* The catalogue can run a few minutes behind WooCommerce, so a strength that
     is already back is answered here rather than filed for an email that
     would never be sent. */
  if (variation.inStock && variation.price !== null) {
    return {
      status: "in_stock",
      message: stockAlertMessage("in_stock", product, variation, input.email),
    };
  }

  /* The offline snapshot carries no WooCommerce ids: a deployment state, not a
     discontinued product, and worded so an operator checks the flag. */
  const target = stockAlertTarget(product, variation);
  const config = wooConfig();
  if (!target || !config) throw new CustomerFacingError(NOT_CONNECTED, 503);

  try {
    const answer = await createWooClient(config).request(
      "/wp-json/wc-tpc/v1/stock-alerts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...target, email: input.email }),
      },
      (value) => pluginAnswer.parse(value),
    );
    return {
      status: answer.status,
      message: stockAlertMessage(
        answer.status,
        product,
        variation,
        input.email,
      ),
    };
  } catch (error) {
    if (error instanceof WordPressRequestError && error.status === 429) {
      throw new CustomerFacingError(
        "That address already has a number of alerts waiting. Please try again later.",
        429,
      );
    }
    /* Transport detail stays on the server; the customer gets something they
       can act on. A 404 here means the plugin is not installed on the store,
       which is the same "not connected" state to them. */
    if (error instanceof WordPressRequestError && error.status === 404) {
      throw new CustomerFacingError(NOT_CONNECTED, 503);
    }
    throw new CustomerFacingError(
      "We couldn't save your alert right now. Please try again shortly.",
      503,
    );
  }
}
