import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import {
  useAgregarItemCompra,
  useAprobarItemCompra,
  useCancelarCompra,
  useCerrarItemConFaltante,
  useCrearCompra,
  useEditarItemCompra,
  useEliminarItemCompra,
  useRechazarItemCompra,
  useRegistrarOrdenDeItem,
  useRegistrarRecepcionDeItem,
  useRegistrarEntregaDeItem,
  useEditarFechaEtapaDeItem,
} from "./use-compra-mutations";

const COMPRA_ID = "compra-1";
const ITEM_ID = "item-1";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

const compraDetalleFixture = {
  id: COMPRA_ID,
  numero: "COM-2026-00001",
  fechaSolicitud: "2026-01-01",
  motivo: "Insumos",
  descripcion: null,
  solicitanteId: "u1",
  cicloId: "ciclo-1",
  sectorId: null,
  estado: "PENDIENTE",
  comprado: false,
  cerrado: false,
  totalesPorMoneda: {},
  canceladaEn: null,
  canceladoPorId: null,
  motivoCancelacion: null,
  items: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const itemFixture = {
  id: ITEM_ID,
  compraId: COMPRA_ID,
  descripcion: "Insumo",
  cantidad: 1,
  proveedor: "ACME",
  monto: 100,
  moneda: "ARS",
  fechaCotizacion: "2026-01-01",
  observaciones: null,
  estadoAprobacion: "PENDIENTE",
  decididoPorId: null,
  decididoEn: null,
  cantidadOrdenada: 0,
  cantidadRecibida: 0,
  cantidadEntregada: 0,
  fechaOrden: null,
  fechaRecepcion: null,
  fechaEntrega: null,
  totalItem: 100,
  cerradoConFaltante: false,
  motivoCierreFaltante: null,
  comprado: false,
  entregado: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * Tabla de los 10 comandos: método, ruta real (`ComprasController`), payload
 * mínimo esperado y el fixture de respuesta. `it.each` cubre en UNA pasada
 * el requisito duro más importante del prompt: `numero`/`solicitanteId`/
 * `cicloId` NUNCA viajan en el body — probarlo 10 veces por separado sería
 * la trampa combinatoria que la regla de testing prohíbe.
 */
const COMANDOS = [
  {
    nombre: "crear compra",
    method: "post" as const,
    ruta: "/api/compras",
    payload: { motivo: "Insumos", fechaSolicitud: "2026-01-01" },
    respuesta: compraDetalleFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useCrearCompra(), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ motivo: "Insumos", fechaSolicitud: "2026-01-01" });
      return result;
    },
  },
  {
    nombre: "agregar ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items`,
    payload: { descripcion: "Insumo", cantidad: 1, proveedor: "ACME", monto: 100, moneda: "ARS", fechaCotizacion: "2026-01-01" },
    respuesta: compraDetalleFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useAgregarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({
        descripcion: "Insumo",
        cantidad: 1,
        proveedor: "ACME",
        monto: 100,
        moneda: "ARS",
        fechaCotizacion: "2026-01-01",
      });
      return result;
    },
  },
  {
    nombre: "editar ítem",
    method: "patch" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}`,
    payload: { descripcion: "Insumo editado" },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useEditarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ itemId: ITEM_ID, dto: { descripcion: "Insumo editado" } });
      return result;
    },
  },
  {
    nombre: "aprobar ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/aprobar`,
    payload: undefined,
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useAprobarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate(ITEM_ID);
      return result;
    },
  },
  {
    nombre: "rechazar ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/rechazar`,
    payload: undefined,
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useRechazarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate(ITEM_ID);
      return result;
    },
  },
  {
    nombre: "registrar orden de ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/registrar-orden`,
    payload: { cantidadOrdenada: 5 },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useRegistrarOrdenDeItem(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ itemId: ITEM_ID, dto: { cantidadOrdenada: 5 } });
      return result;
    },
  },
  {
    nombre: "registrar recepción de ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/registrar-recepcion`,
    payload: { cantidadRecibida: 5 },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useRegistrarRecepcionDeItem(COMPRA_ID), {
        wrapper: wrapper(buildClient()),
      });
      result.current.mutate({ itemId: ITEM_ID, dto: { cantidadRecibida: 5 } });
      return result;
    },
  },
  {
    nombre: "registrar entrega de ítem",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/registrar-entrega`,
    payload: { cantidadEntregada: 3 },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useRegistrarEntregaDeItem(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ itemId: ITEM_ID, dto: { cantidadEntregada: 3 } });
      return result;
    },
  },
  {
    nombre: "editar fecha de etapa de ítem",
    method: "patch" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/fecha-etapa`,
    payload: { etapa: "ORDEN", fecha: "2026-01-05" },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useEditarFechaEtapaDeItem(COMPRA_ID), {
        wrapper: wrapper(buildClient()),
      });
      result.current.mutate({ itemId: ITEM_ID, dto: { etapa: "ORDEN", fecha: "2026-01-05" } });
      return result;
    },
  },
  {
    nombre: "cerrar ítem con faltante",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/items/${ITEM_ID}/cerrar-con-faltante`,
    payload: { motivo: "Proveedor no entregó el resto" },
    respuesta: itemFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useCerrarItemConFaltante(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ itemId: ITEM_ID, dto: { motivo: "Proveedor no entregó el resto" } });
      return result;
    },
  },
  {
    nombre: "cancelar compra",
    method: "post" as const,
    ruta: `/api/compras/${COMPRA_ID}/cancelar`,
    payload: { motivo: "Ya no se necesita" },
    respuesta: compraDetalleFixture,
    ejecutar: () => {
      const { result } = renderHook(() => useCancelarCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ motivo: "Ya no se necesita" });
      return result;
    },
  },
] as const;

describe("use-compra-mutations — los 10 comandos de ComprasController", () => {
  it.each(COMANDOS)(
    "$nombre → pega a la ruta correcta con el payload correcto, SIN numero/solicitanteId/cicloId",
    async ({ method, ruta, payload, respuesta, ejecutar }) => {
      let capturedBody: unknown = null;
      let bodyWasRead = false;
      server.use(
        http[method](ruta, async ({ request }) => {
          const raw = await request.text();
          bodyWasRead = true;
          capturedBody = raw ? JSON.parse(raw) : undefined;
          return HttpResponse.json(respuesta, { status: 200 });
        }),
      );

      const result = ejecutar();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(bodyWasRead).toBe(true);
      if (payload === undefined) {
        expect(capturedBody).toBeUndefined();
      } else {
        expect(capturedBody).toEqual(payload);
      }
      // Requisito duro: numero/solicitanteId/cicloId JAMÁS viajan en un body de comando.
      const bodyRecord = capturedBody as Record<string, unknown> | undefined;
      expect(bodyRecord?.numero).toBeUndefined();
      expect(bodyRecord?.solicitanteId).toBeUndefined();
      expect(bodyRecord?.cicloId).toBeUndefined();
    },
  );

  it("eliminar ítem → DELETE a la ruta correcta, sin body", async () => {
    let called = false;
    server.use(
      http.delete(`/api/compras/${COMPRA_ID}/items/${ITEM_ID}`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useEliminarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
    result.current.mutate(ITEM_ID);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(called).toBe(true);
  });

  it("mutación exitosa sobre una compra existente invalida detalle + bitácora + listado", async () => {
    server.use(
      http.post(`/api/compras/${COMPRA_ID}/items/${ITEM_ID}/aprobar`, () => HttpResponse.json(itemFixture)),
    );
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAprobarItemCompra(COMPRA_ID), { wrapper: wrapper(queryClient) });
    result.current.mutate(ITEM_ID);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["compra", COMPRA_ID]);
    expect(keys).toContainEqual(["compra-operaciones", COMPRA_ID]);
    expect(keys).toContainEqual(["compras"]);
    invalidateSpy.mockRestore();
  });

  it("crear compra invalida SOLO el listado (no hay detalle/bitácora previos)", async () => {
    server.use(http.post("/api/compras", () => HttpResponse.json(compraDetalleFixture, { status: 201 })));
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCrearCompra(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ motivo: "Insumos", fechaSolicitud: "2026-01-01" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual([["compras"]]);
    invalidateSpy.mockRestore();
  });

  describe("propagación de errores de dominio (422/404/409) al usuario", () => {
    afterEach(() => vi.restoreAllMocks());

    it("422 (regla de dominio, ej. ItemCompraYaDecididoError) llega como ApiError con el mensaje real del backend", async () => {
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/items/${ITEM_ID}/aprobar`, () =>
          HttpResponse.json({ statusCode: 422, message: "El ítem ya fue decidido." }, { status: 422 }),
        ),
      );

      const { result } = renderHook(() => useAprobarItemCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate(ITEM_ID);

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ statusCode: 422, message: "El ítem ya fue decidido." });
    });

    it("404 (CompraNoEncontradaError) llega como ApiError con statusCode 404", async () => {
      server.use(
        http.post(`/api/compras/${COMPRA_ID}/cancelar`, () =>
          HttpResponse.json({ statusCode: 404, message: "Compra no encontrada." }, { status: 404 }),
        ),
      );

      const { result } = renderHook(() => useCancelarCompra(COMPRA_ID), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ motivo: "x" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ statusCode: 404, message: "Compra no encontrada." });
    });

    it("409 (SinCicloActivoError) llega como ApiError con statusCode 409", async () => {
      server.use(
        http.post("/api/compras", () =>
          HttpResponse.json({ statusCode: 409, message: "No hay ciclo activo." }, { status: 409 }),
        ),
      );

      const { result } = renderHook(() => useCrearCompra(), { wrapper: wrapper(buildClient()) });
      result.current.mutate({ motivo: "x", fechaSolicitud: "2026-01-01" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ statusCode: 409, message: "No hay ciclo activo." });
    });
  });
});
