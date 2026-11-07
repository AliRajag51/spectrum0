import "server-only";

import { z } from "zod";
import { bridgeRequest } from "@/server/wordpress/bridge";

const health = z.object({ require_account: z.boolean() });

/** Read WooCommerce's current guest-checkout policy for each checkout attempt. */
export async function checkoutRequiresAccount() {
  const result = await bridgeRequest("health", {}, (value) => health.parse(value));
  return result.require_account;
}
