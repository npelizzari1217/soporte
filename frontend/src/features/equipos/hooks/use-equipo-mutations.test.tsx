import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useInstalarComponenteDesdeDeposito, useAgregarComponente } from "./use-equipo-mutations";

const EQUIPO_ID = "22222222-2222-2222-2222-222222222222";
const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const COMPONENTE_FIXTURE = {
  id: "comp-1",
  equipoId: EQUIPO_ID,
  tipoComponenteCodigo: "MOUSE",
  insumoId: INSUMO_ID,
  descripcion: null,
  numeroSerie: null,
  capacidad: null,
  activo: true,
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

/**
 * El vínculo del WU-3 y la instalación del WU-4 se parecen en todo MENOS en
 * esto: uno no mueve stock y el otro sí. Los dos tests de abajo son gemelos
 * invertidos sobre esa diferencia — sin ellos, copiarle el criterio de cache a
 * `useAgregarComponente` deja la sección Repuestos mostrando el stock viejo
 * después de instalar, y nada lo delata hasta que un usuario lo ve.
 */
describe("useInstalarComponenteDesdeDeposito", () => {
  it("pega a POST /equipos/:id/componentes/instalar-desde-deposito con el body correcto", async () => {
    let recibido: unknown = null;
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, async ({ request }) => {
        recibido = await request.json();
        return HttpResponse.json(COMPONENTE_FIXTURE, { status: 201 });
      }),
    );
    const queryClient = buildClient();
    const { result } = renderHook(() => useInstalarComponenteDesdeDeposito(EQUIPO_ID), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ insumoId: INSUMO_ID, descripcion: "Mouse del depósito" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recibido).toEqual({ insumoId: INSUMO_ID, descripcion: "Mouse del depósito" });
  });

  it("invalida el stock del insumo, sus movimientos y el listado: instalar DESCUENTA", async () => {
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/componentes/instalar-desde-deposito`, () =>
        HttpResponse.json(COMPONENTE_FIXTURE, { status: 201 }),
      ),
    );
    const queryClient = buildClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useInstalarComponenteDesdeDeposito(EQUIPO_ID), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ insumoId: INSUMO_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const claves = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(claves).toContain(JSON.stringify(["equipo", EQUIPO_ID]));
    expect(claves).toContain(JSON.stringify(["insumo", INSUMO_ID, "stock"]));
    expect(claves).toContain(JSON.stringify(["insumo", INSUMO_ID, "movimientos"]));
    expect(claves).toContain(JSON.stringify(["insumos"]));
  });
});

describe("useAgregarComponente", () => {
  it("NO invalida ninguna query de insumos: vincular no mueve stock", async () => {
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/componentes`, () =>
        HttpResponse.json(COMPONENTE_FIXTURE, { status: 201 }),
      ),
    );
    const queryClient = buildClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAgregarComponente(EQUIPO_ID), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ insumoId: INSUMO_ID });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const claves = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(claves).toContain(JSON.stringify(["equipo", EQUIPO_ID]));
    expect(claves.some((k) => k?.includes("insumo"))).toBe(false);
  });
});
