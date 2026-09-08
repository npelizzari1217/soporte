import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { ApiError } from "@/shared/api/types";
import { useRegistrarEntradaInsumo } from "./use-insumo-mutations";

const INSUMO_ID = "11111111-1111-1111-1111-111111111111";

const MOVIMIENTO_FIXTURE = {
  id: "mov-1",
  insumoId: INSUMO_ID,
  tipo: "ENTRADA",
  cantidad: 10,
  usuarioId: "u1",
  motivo: null,
  equipoId: null,
  sectorId: null,
  itemCompraId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

describe("useRegistrarEntradaInsumo", () => {
  it("pega a POST /insumos/:insumoId/movimientos/entrada con el body correcto", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/entrada`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(MOVIMIENTO_FIXTURE, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useRegistrarEntradaInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedBody).toEqual({ cantidad: 10 });
  });

  it("una entrada exitosa invalida la existencia y la bitácora del insumo (PREFIJO, cubre cualquier página)", async () => {
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/entrada`, () =>
        HttpResponse.json(MOVIMIENTO_FIXTURE, { status: 201 }),
      ),
    );
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRegistrarEntradaInsumo(INSUMO_ID), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate({ cantidad: 10 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // `invalidateSpy` está tipado por la firma REAL de `invalidateQueries`
    // (`InvalidateQueryFilters | undefined`), sin cast: `call[0]` ya trae
    // `queryKey` como campo opcional del propio tipo de TanStack Query.
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "stock"]);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "movimientos"]);
    invalidateSpy.mockRestore();
  });

  it("422 (insumo deshabilitado) llega como ApiError con el mensaje real del backend", async () => {
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/entrada`, () =>
        HttpResponse.json({ statusCode: 422, message: "El insumo está deshabilitado." }, { status: 422 }),
      ),
    );

    const { result } = renderHook(() => useRegistrarEntradaInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 10 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({
      statusCode: 422,
      message: "El insumo está deshabilitado.",
    });
  });
});
