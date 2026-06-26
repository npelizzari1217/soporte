"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/types";

/**
 * QueryClient defaults:
 * - retry: only on 5xx (≤2 retries); NO retry on 401 or other 4xx.
 *   401 is already handled transparently by apiFetch's single-flight refresh.
 * - refetchOnWindowFocus: false — avoids spurious refetches in a SPA.
 * - staleTime: 30s — keeps data fresh without constant polling.
 *
 * Spec: infrastructure for [SPEC:frontend-api-client/normalizacion-respuestas] TanStack integration
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          error instanceof ApiError &&
          error.statusCode >= 500 &&
          failureCount < 2,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures the QueryClient is NOT recreated on every render,
  // but IS created fresh per-component-tree (important for SSR safety).
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
