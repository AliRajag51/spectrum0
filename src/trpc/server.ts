import "server-only";

import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/context";
import type { AppRouter } from "@/server/api/root";

export const getQueryClient = cache(() =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1 },
      mutations: { retry: false },
    },
  }),
);

export function getServerTRPC(request: Request) {
  return createTRPCOptionsProxy<AppRouter>({
    router: appRouter,
    ctx: createTRPCContext({ req: request }),
    queryClient: getQueryClient(),
  });
}
