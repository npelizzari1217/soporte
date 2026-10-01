import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useAgregarComponente, useDarDeBajaEquipo } from "./use-equipo-mutations";

const EQUIPO_ID = "22222222-2222-2222-2222-222222222222";
const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const COMPONENTE_FIXTURE = {
  id: "comp-1",
  equipoId: EQUIPO_ID,
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

describe("useAgregarComponente", () => {
  it("pega a POST /equipos/:id/componentes con el body tal cual, descontarStock incluido", async () => {
    let recibido: unknown = null;
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/componentes`, async ({ request }) => {
        recibido = await request.json();
        return HttpResponse.json(COMPONENTE_FIXTURE, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useAgregarComponente(EQUIPO_ID), {
      wrapper: wrapper(buildClient()),
    });

    result.current.mutate({ insumoId: INSUMO_ID, descontarStock: false, descripcion: "Mouse" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recibido).toEqual({ insumoId: INSUMO_ID, descontarStock: false, descripcion: "Mouse" });
  });

  it("invalida el equipo, el stock del insumo, sus movimientos y el listado: el alta puede descontar", async () => {
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

    result.current.mutate({ insumoId: INSUMO_ID, descontarStock: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const claves = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(claves).toContain(JSON.stringify(["equipo", EQUIPO_ID]));
    expect(claves).toContain(JSON.stringify(["insumo", INSUMO_ID, "stock"]));
    expect(claves).toContain(JSON.stringify(["insumo", INSUMO_ID, "movimientos"]));
    expect(claves).toContain(JSON.stringify(["insumos"]));
  });
});

describe("useDarDeBajaEquipo", () => {
  it("pega a POST /equipos/:id/baja y al éxito invalida el listado, el detalle y los insumos", async () => {
    let recibido: unknown = null;
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/baja`, async ({ request }) => {
        recibido = await request.json();
        return HttpResponse.json({ id: EQUIPO_ID, activo: false });
      }),
    );
    const queryClient = buildClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDarDeBajaEquipo(EQUIPO_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ destino: "DESCARTE", categoria: "VEJEZ" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recibido).toEqual({ destino: "DESCARTE", categoria: "VEJEZ" });
    const claves = invalidate.mock.calls.map(([filtro]) => filtro?.queryKey);
    expect(claves).toEqual(expect.arrayContaining([["equipos"], ["equipo", EQUIPO_ID], ["insumos"]]));
  });

  it("con un 409 invalida el detalle (y con él el resumen) y no invalida el listado", async () => {
    server.use(
      http.post(`*/equipos/${EQUIPO_ID}/baja`, () =>
        HttpResponse.json({ statusCode: 409, message: "cambió" }, { status: 409 }),
      ),
    );
    const queryClient = buildClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDarDeBajaEquipo(EQUIPO_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ destino: "STOCK_USADO", categoria: "VEJEZ" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate.mock.calls.map(([filtro]) => filtro?.queryKey)).toEqual([["equipo", EQUIPO_ID]]);
  });
});
