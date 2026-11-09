"use client";

/**
 * QueryProvider — instancia de TanStack Query compartida por toda la app.
 *
 * El QueryClient se crea con useState (no como módulo top-level) para que
 * cada request SSR tenga su propia instancia y no se filtre estado entre
 * usuarios/requests.
 */

import { useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { avisarSaturacion, esSaturacion } from "@/shared/lib/saturacion";

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => {
    const cliente: QueryClient = new QueryClient({
      // Saturación del servidor (odd/saturacion-conexiones, S2): cualquier consulta de cualquier
      // pantalla muestra el mismo aviso, y «Reintentar» vuelve a pedir solo lo que falló.
      queryCache: new QueryCache({
        onError: (error) => {
          if (esSaturacion(error)) {
            avisarSaturacion(() => {
              void cliente.refetchQueries({ predicate: (query) => query.state.status === "error" });
            });
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
        },
      },
    });
    return cliente;
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
