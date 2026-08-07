import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

/**
 * renderWithProviders — helper compartido para tests de feature components
 * que consumen TanStack Query + `useSession()`. Evita repetir el mismo
 * boilerplate de providers en cada suite de B1+.
 */
export function renderWithProviders(
  ui: ReactElement,
  { user = null }: { user?: JwtPayload | null } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
        {ui}
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

/** Fixture base — ADMINISTRADOR (19 permisos, spec §1). Overridable por test. */
export function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "u1",
    cliente_id: "c1",
    rol: "ADMINISTRADOR",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Cliente Uno",
    membresias: [],
    modulos: [],
    ...overrides,
  };
}
