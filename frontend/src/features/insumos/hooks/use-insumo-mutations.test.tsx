import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { ApiError } from "@/shared/api/types";
import {
  useRegistrarEntradaInsumo,
  useRegistrarSalidaInsumo,
  useRegistrarAjusteInsumo,
} from "./use-insumo-mutations";

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

describe("useRegistrarSalidaInsumo", () => {
  const MOVIMIENTO_SALIDA_FIXTURE = { ...MOVIMIENTO_FIXTURE, tipo: "SALIDA" };

  it("pega a POST /insumos/:insumoId/movimientos/salida con el body correcto", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/salida`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(MOVIMIENTO_SALIDA_FIXTURE, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useRegistrarSalidaInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedBody).toEqual({ cantidad: 3 });
  });

  it("una salida exitosa invalida la existencia y la bitácora del insumo (PREFIJO, cubre cualquier página)", async () => {
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/salida`, () =>
        HttpResponse.json(MOVIMIENTO_SALIDA_FIXTURE, { status: 201 }),
      ),
    );
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRegistrarSalidaInsumo(INSUMO_ID), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate({ cantidad: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "stock"]);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "movimientos"]);
    invalidateSpy.mockRestore();
  });

  /**
   * `StockInsuficienteError` (backend, `movimientos-insumo.controller.ts`)
   * llega como 422 con los dos números del dominio en el mensaje. El assert
   * es de CONTENIDO, no de bandera: `isError` solo no distingue este 422 de
   * cualquier otro.
   */
  it("422 (stock insuficiente) llega como ApiError con el mensaje real del backend", async () => {
    const MENSAJE_BACKEND = "Stock insuficiente: se pidieron 10, hay 4 disponibles.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/salida`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    const { result } = renderHook(() => useRegistrarSalidaInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 10 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({
      statusCode: 422,
      message: MENSAJE_BACKEND,
    });
  });
});

describe("useRegistrarAjusteInsumo", () => {
  const MOVIMIENTO_AJUSTE_FIXTURE = { ...MOVIMIENTO_FIXTURE, tipo: "AJUSTE_NEGATIVO", motivo: "Conteo físico" };

  it("pega a POST /insumos/:insumoId/movimientos/ajuste con el body correcto, incluido tipo", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/ajuste`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(MOVIMIENTO_AJUSTE_FIXTURE, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useRegistrarAjusteInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 3, motivo: "Conteo físico", tipo: "AJUSTE_NEGATIVO" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedBody).toEqual({ cantidad: 3, motivo: "Conteo físico", tipo: "AJUSTE_NEGATIVO" });
  });

  it("un ajuste exitoso invalida la existencia y la bitácora del insumo (PREFIJO, cubre cualquier página)", async () => {
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/ajuste`, () =>
        HttpResponse.json(MOVIMIENTO_AJUSTE_FIXTURE, { status: 201 }),
      ),
    );
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRegistrarAjusteInsumo(INSUMO_ID), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate({ cantidad: 3, motivo: "Conteo físico", tipo: "AJUSTE_NEGATIVO" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "stock"]);
    expect(keys).toContainEqual(["insumo", INSUMO_ID, "movimientos"]);
    invalidateSpy.mockRestore();
  });

  /**
   * `MotivoAjusteRequeridoError` (backend, `movimiento-insumo.entity.ts`)
   * llega como 422 con el mensaje real del dominio. El schema del cliente
   * (`registrarAjusteInsumoSchema`) ya bloquea este caso antes del POST — este
   * test cubre el hook de mutación en sí, que es lo único que puede pegarle
   * al backend directamente sin pasar por el formulario.
   */
  it("422 (motivo sin contenido) llega como ApiError con el mensaje real del backend", async () => {
    const MENSAJE_BACKEND = "El motivo del ajuste no puede estar vacío.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/ajuste`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    const { result } = renderHook(() => useRegistrarAjusteInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 3, motivo: "", tipo: "AJUSTE_NEGATIVO" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({
      statusCode: 422,
      message: MENSAJE_BACKEND,
    });
  });

  /**
   * `StockInsuficienteError` aplica también al ajuste, pero SOLO cuando es
   * `AJUSTE_NEGATIVO` (ver el JSDoc de `registrarAjusteInsumoSchema` para por
   * qué el positivo no tiene esta precondición).
   */
  it("422 (stock insuficiente en un ajuste negativo) llega como ApiError con el mensaje real del backend", async () => {
    const MENSAJE_BACKEND = "Stock insuficiente: se pidieron 10, hay 4 disponibles.";
    server.use(
      http.post(`/api/insumos/${INSUMO_ID}/movimientos/ajuste`, () =>
        HttpResponse.json({ statusCode: 422, message: MENSAJE_BACKEND }, { status: 422 }),
      ),
    );

    const { result } = renderHook(() => useRegistrarAjusteInsumo(INSUMO_ID), {
      wrapper: wrapper(buildClient()),
    });
    result.current.mutate({ cantidad: 10, motivo: "Conteo físico", tipo: "AJUSTE_NEGATIVO" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({
      statusCode: 422,
      message: MENSAJE_BACKEND,
    });
  });
});
