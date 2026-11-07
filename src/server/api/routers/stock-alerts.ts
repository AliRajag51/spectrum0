import "server-only";

import { stockAlertInput } from "@/lib/stock-alerts";
import { requestStockAlert } from "@/server/stock-alerts";
import { customerProcedure, router, throttle } from "@/server/api/trpc";

/* Restock alerts.
 *
 * One procedure: file a request to be emailed when a strength is back. Anyone
 * can call it - a customer waiting on a product is not necessarily signed in -
 * so it is throttled per caller here and per address on the store. */

export const stockAlertsRouter = router({
  request: customerProcedure
    .input(stockAlertInput)
    .mutation(({ ctx, input }) => {
      throttle(ctx.request.headers, "stock-alert", 10);
      return requestStockAlert(input);
    }),
});
