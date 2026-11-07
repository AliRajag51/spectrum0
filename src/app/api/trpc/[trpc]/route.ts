import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/context";

export const runtime = "nodejs";

/**
 * Same-origin guard for state changing calls.
 *
 * A batch can carry a session cookie into a mutation, so a cross-site POST has
 * to be refused rather than merely unable to read the reply. Browsers always
 * send `Origin` on a scripted POST, so a missing one is a non-browser caller
 * and is left to the procedures own auth.
 */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("host") || new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function handler(req: Request) {
  if (req.method === "POST" && !sameOrigin(req)) {
    return new Response(JSON.stringify({ error: "Cross-site request refused." }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
    });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req: request, resHeaders }) =>
      createTRPCContext({ req: request, resHeaders }),
    /* A batch mixes public reads with a customer session, so the whole response
       is private. Never let a shared cache hold one customer answer for another. */
    responseMeta: () => ({
      headers: { "cache-control": "private, no-store" },
    }),
  });
}
export { handler as GET, handler as POST };
