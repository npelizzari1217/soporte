import { createElement, type ReactElement, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";
import type { AccionTipoTicket, PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";

/**
 * Permisos por tipo para tests (odd/permisos-por-tipo-ticket, T6): arma `porModulo` como el
 * backend, uniendo las acciones de los tipos de cada módulo.
 *
 * @param porTipo Acciones concedidas por id de tipo.
 * @param moduloDe Módulo de cada tipo; un tipo sin módulo no suma a `porModulo`.
 * @returns La respuesta de `GET /tickets/permisos-por-tipo` de un usuario con restricción.
 */
export function permisosDeTest(
  porTipo: Record<string, AccionTipoTicket[]>,
  moduloDe: Record<string, string> = {},
): PermisosPorTipo {
  const porModulo: Record<string, AccionTipoTicket[]> = {};
  for (const [tipoId, acciones] of Object.entries(porTipo)) {
    const modulo = moduloDe[tipoId];
    if (modulo === undefined) continue;
    porModulo[modulo] = [...new Set([...(porModulo[modulo] ?? []), ...acciones])];
  }
  return { sinRestriccion: false, porTipo, porModulo };
}

/**
 * Handler MSW de `GET /api/tickets/permisos-por-tipo`, para `server.use(...)`.
 *
 * @param permisos Respuesta que devuelve el backend simulado.
 * @returns El handler.
 */
export function handlerPermisosPorTipo(permisos: PermisosPorTipo) {
  return http.get("/api/tickets/permisos-por-tipo", () => HttpResponse.json(permisos));
}

/**
 * Como `renderWithProviders`, pero con los permisos por tipo ya conocidos desde el primer render:
 * llegan por la misma hidratación que usa el layout del servidor (`permisosPorTipoIniciales`), y el
 * backend simulado responde lo mismo si la consulta se vuelve a pedir. Así un assert de ausencia no
 * pasa por estar todavía cargando.
 *
 * @param ui Elemento a renderizar.
 * @param opciones Usuario de la sesión y sus permisos por tipo.
 * @returns El resultado de `render`.
 */
export function renderConPermisos(
  ui: ReactElement,
  { user, permisos }: { user: JwtPayload; permisos: PermisosPorTipo },
): RenderResult {
  server.use(handlerPermisosPorTipo(permisos));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const permisosPorTipoIniciales = { user, permisos };

  function Providers({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        SessionContext.Provider,
        { value: { user, isLoading: false, setUser: () => {}, permisosPorTipoIniciales } },
        children,
      ),
    );
  }

  return render(ui, { wrapper: Providers });
}
