import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

/**
 * renderWithProviders — helper compartido para tests de feature components
 * que consumen TanStack Query + `useSession()`. Evita repetir el mismo
 * boilerplate de providers en cada suite de B1+.
 *
 * Los providers van como `wrapper` (no envolviendo `ui` a mano) para que el
 * `rerender` que devuelve RTL los conserve: un test que repinta el componente
 * —por ejemplo para simular el repintado que hace `router.replace`— seguiría
 * teniendo QueryClient y sesión.
 */
export function renderWithProviders(
  ui: ReactElement,
  { user = null }: { user?: JwtPayload | null } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Providers });
}

/** Fixture base — rol ADMINISTRADOR SIN permisos: cada test agrega los que
 *  necesita por `overrides`. Un fixture con permisos de arranque haría pasar
 *  a los tests de autorización sin que ninguno los declare. */
export function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "u1",
    cliente_id: "c1",
    rol: "ADMINISTRADOR",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Cliente Uno",
    zona_horaria: "Europe/Madrid",
    membresias: [],
    modulos: [],
    nombre: "Juan",
    apellido: "Pérez",
    ...overrides,
  };
}
