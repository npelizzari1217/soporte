"use client";

/**
 * QueryProvider — instancia de TanStack Query compartida por toda la app.
 *
 * El QueryClient se crea con useState (no como módulo top-level) para que
 * cada request SSR tenga su propia instancia y no se filtre estado entre
 * usuarios/requests.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
