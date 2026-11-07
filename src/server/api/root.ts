import { newsletterInput, subscribeNewsletter } from "@/server/newsletter";
import { contactInput } from "@/lib/forms";
import { sendContactMessage } from "@/server/forms";
import { accountRouter } from "@/server/api/routers/account";
import { cartRouter } from "@/server/api/routers/cart";
import { stockAlertsRouter } from "@/server/api/routers/stock-alerts";
import { clientKey } from "@/lib/rate-limit";
import { customerProcedure, router, throttle } from "@/server/api/trpc";



export const appRouter = router({
  account: accountRouter,
  cart: cartRouter,
  stockAlerts: stockAlertsRouter,
  newsletter: router({
    subscribe: customerProcedure
      .input(newsletterInput)
      .mutation(({ ctx, input }) => {
        throttle(ctx.request.headers, "newsletter", 5);
        return subscribeNewsletter(input, clientKey(ctx.request.headers));
      }),
  }),
  contact: router({
    send: customerProcedure.input(contactInput).mutation(({ ctx, input }) => {
      throttle(ctx.request.headers, "contact", 5);
      return sendContactMessage(input, clientKey(ctx.request.headers));
    }),
  }),
});
export type AppRouter = typeof appRouter;
