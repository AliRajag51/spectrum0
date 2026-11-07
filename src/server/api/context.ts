import "server-only";

import { readSessionFromHeader } from "@/server/account/session";

export type TRPCContext = {
  request: Request;
  requestId: string;
  /** The customer credential this request carries, revalidated upstream on use. */
  auth: string | null;
  /** Response headers the handler will send, so a procedure can set cookies. */
  resHeaders: Headers;
};

export function createTRPCContext({
  req,
  resHeaders,
}: {
  req: Request;
  resHeaders?: Headers;
}): TRPCContext {
  return {
    request: req,
    requestId: crypto.randomUUID(),
    auth: readSessionFromHeader(req.headers.get("cookie")),
    resHeaders: resHeaders ?? new Headers(),
  };
}
