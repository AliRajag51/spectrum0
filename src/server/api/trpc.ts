import "server-only";

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import type { TRPCContext } from "@/server/api/context";
import { CustomerFacingError } from "@/server/errors";

/**
 * The first thing a Zod failure has to say, in words.
 *
 * `ZodError.message` is the JSON of every issue, and tRPC puts it on the wire
 * as the error message. Seven account forms render that message straight into
 * their error box, so a mistyped address answered with a serialized array
 * beginning `[ { "origin": "string", "code": "invalid_format", ...`. Duck-typed
 * rather than `instanceof`, because an error thrown by a different copy of zod
 * on the dependency tree is still one of these.
 */
function zodMessage(cause: unknown): string | null {
  const issues = (cause as { issues?: unknown })?.issues;
  if (!Array.isArray(issues)) return null;
  const first = issues.find(
    (issue) => typeof (issue as { message?: unknown })?.message === "string",
  ) as { message: string } | undefined;
  return first?.message ?? "errors.common.fallback";
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  /* These procedures answer sign in and account reads, so the error body is
     kept to the code and the customer-facing message. The default formatter
     attaches a server stack outside production; nothing here needs it. */
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: zodMessage(error.cause) ?? shape.message,
    data: { ...shape.data, stack: undefined },
  }),
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Turn a customer-facing domain failure into the matching tRPC error.
 *
 * The bridge and the checkout service both write their messages for customers,
 * so those are carried through rather than replaced; anything else stays a
 * generic server error.
 */
const trpcCodeFor: Record<number, TRPCError["code"]> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
  503: "SERVICE_UNAVAILABLE",
};

function asTRPCError(error: CustomerFacingError) {
  return new TRPCError({
    code: trpcCodeFor[error.status] ?? "INTERNAL_SERVER_ERROR",
    message: error.message,
    cause: error,
  });
}

/* A resolver that throws does not propagate out of `next()`: tRPC returns it as
   a failed middleware result, already wrapped as an INTERNAL_SERVER_ERROR with
   the original as its cause. Both shapes are unwrapped here, or a wrong sign-in
   would answer 500 instead of 401. */
const customerFacingErrors = t.middleware(async ({ next }) => {
  let result;
  try {
    result = await next();
  } catch (error) {
    if (error instanceof CustomerFacingError) throw asTRPCError(error);
    throw error;
  }
  if (!result.ok && result.error.cause instanceof CustomerFacingError) {
    throw asTRPCError(result.error.cause);
  }
  return result;
});

export const customerProcedure = t.procedure.use(customerFacingErrors);

/** Every account read and write. Identity comes only from the session cookie. */
export const protectedProcedure = customerProcedure.use(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/**
 * The storefront's own throttle, per caller, per minute.
 *
 * WordPress limits per email address, which is the account-takeover surface;
 * it cannot limit per caller because every call reaches it from this server.
 * So the two halves live on opposite sides of the bridge.
 */
export function throttle(headers: Headers, bucket: string, max: number) {
  const verdict = rateLimit(`${bucket}:${clientKey(headers)}`, { max, windowMs: 60_000 });
  if (!verdict.ok) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Wait a moment and try again.",
    });
  }
}
