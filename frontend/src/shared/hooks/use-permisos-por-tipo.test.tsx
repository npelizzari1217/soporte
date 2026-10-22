import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../test/msw/server";
import { buildUser } from "../../../test/render-with-providers";
import { SessionContext, type PermisosPorTipoIniciales } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";
import { usePermisosPorTipo } from "./use-permisos-por-tipo";
import { handlerPermisosPorTipo, permisosDeTest } from "./use-permisos-por-tipo.test-helpers";

const TECNICO = buildUser({ sub: "tec-1", rol: "TECNICO", permisos: ["TICKETS:ASIGNAR"] });

const PERMISOS = permisosDeTest(
  { "tipo-soporte": ["LECTURA", "MODIFICACION"], "tipo-mantenimiento": ["LECTURA", "ALTAS"] },
  { "tipo-soporte": "TICKETS", "tipo-mantenimiento": "EDILICIA" },
);

function wrapper(user: JwtPayload | null, iniciales: PermisosPorTipoIniciales | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider
          value={{ user, isLoading: false, setUser: () => {}, permisosPorTipoIniciales: iniciales }}
        >
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe("usePermisosPorTipo (odd/permisos-por-tipo-ticket, T6)", () => {
  it("decide por tipo y por módulo con la respuesta del backend, no con las celdas del JWT", async () => {
    server.use(handlerPermisosPorTipo(PERMISOS));
    const { result } = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(TECNICO) });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.puedeEnTipo("tipo-soporte", "MODIFICACION")).toBe(true);
    expect(result.current.puedeEnTipo("tipo-mantenimiento", "MODIFICACION")).toBe(false);
    // La celda TICKETS:ASIGNAR del JWT no concede ASIGNAR en ningún tipo.
    expect(result.current.puedeEnAlgunTipo("ASIGNAR")).toBe(false);
    expect(result.current.puedeEnModulo("EDILICIA", "ALTAS")).toBe(true);
    expect(result.current.puedeEnModulo("TICKETS", "ALTAS")).toBe(false);
    expect(
      result.current
        .tiposCon([{ id: "tipo-soporte" }, { id: "tipo-mantenimiento" }, { id: "tipo-otro" }], "LECTURA")
        .map((t) => t.id),
    ).toEqual(["tipo-soporte", "tipo-mantenimiento"]);
  });

  it("mientras no hay respuesta, ninguna acción se ofrece", () => {
    server.use(http.get("/api/tickets/permisos-por-tipo", () => new Promise(() => {})));
    const { result } = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(TECNICO) });

    expect(result.current.isPending).toBe(true);
    expect(result.current.permisos).toBeNull();
    expect(result.current.puedeEnTipo("tipo-soporte", "LECTURA")).toBe(false);
  });

  it("con error del backend, ninguna acción se ofrece", async () => {
    server.use(http.get("/api/tickets/permisos-por-tipo", () => HttpResponse.json({}, { status: 500 })));
    const { result } = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(TECNICO) });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.permisos).toBeNull();
    expect(result.current.puedeEnModulo("TICKETS", "LECTURA")).toBe(false);
  });

  it("ADMINISTRADOR y ROOT quedan sin restricción y no consultan", () => {
    let consultas = 0;
    server.use(
      http.get("/api/tickets/permisos-por-tipo", () => {
        consultas += 1;
        return HttpResponse.json(PERMISOS);
      }),
    );
    for (const user of [buildUser({ rol: "ADMINISTRADOR" }), buildUser({ rol: null, is_global_admin: true })]) {
      const { result } = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(user) });
      expect(result.current.isPending).toBe(false);
      expect(result.current.puedeEnTipo("cualquier-tipo", "BORRADO")).toBe(true);
    }
    expect(consultas).toBe(0);
  });

  it("usa los permisos leídos en el servidor solo si son de la misma sesión", async () => {
    server.use(handlerPermisosPorTipo(permisosDeTest({ "tipo-soporte": ["LECTURA"] })));
    const iniciales = { user: TECNICO, permisos: PERMISOS };

    const misma = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(TECNICO, iniciales) });
    // Sin esperar a la red: ya hidratados.
    expect(misma.result.current.puedeEnTipo("tipo-soporte", "MODIFICACION")).toBe(true);

    // Otro cliente (TenantSwitcher): los del servidor no valen, se piden de nuevo.
    const otroCliente = { ...TECNICO, cliente_id: "c2" };
    const cambiada = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(otroCliente, iniciales) });
    expect(cambiada.result.current.puedeEnTipo("tipo-soporte", "MODIFICACION")).toBe(false);
    await waitFor(() => expect(cambiada.result.current.puedeEnTipo("tipo-soporte", "LECTURA")).toBe(true));
    expect(cambiada.result.current.puedeEnTipo("tipo-soporte", "MODIFICACION")).toBe(false);
  });

  it("una respuesta con una acción desconocida se descarta entera", async () => {
    server.use(
      http.get("/api/tickets/permisos-por-tipo", () =>
        HttpResponse.json({ sinRestriccion: false, porTipo: { t: ["INVENTADA"] }, porModulo: {} }),
      ),
    );
    const { result } = renderHook(() => usePermisosPorTipo(), { wrapper: wrapper(TECNICO) });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.permisos).toBeNull();
  });
});
