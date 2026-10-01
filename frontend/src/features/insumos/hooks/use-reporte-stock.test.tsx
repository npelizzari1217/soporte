import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import { useReporteStock } from "./use-reporte-stock";

const FAMILIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GENERADO = "2026-10-01T12:00:00.000Z";

function respuesta() {
  return {
    generadoEn: GENERADO,
    filas: [
      {
        insumoId: "i-1",
        codigo: "R-1",
        nombre: "Toner",
        activo: true,
        seguimiento: "NINGUNO",
        familia: { id: FAMILIA, nombre: "Toners", esRepuesto: false },
        unidadMedida: { codigo: "UN", nombre: "Unidad", entera: true },
        saldos: { NUEVO: 3, USADO: 2, total: 5 },
        stockMinimo: 5,
        estadoReposicion: "BAJO_MINIMO",
      },
    ],
  };
}

function crearWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useReporteStock", () => {
  it("manda los filtros serializados y devuelve generadoEn y filas", async () => {
    let query = "";
    server.use(
      http.get("/api/insumos/reporte-stock", ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json(respuesta());
      }),
    );

    const { result } = renderHook(
      () => useReporteStock({ familiaId: FAMILIA, soloBajoMinimo: true }),
      { wrapper: crearWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(query).toBe(`?familiaId=${FAMILIA}&soloBajoMinimo=true`);
    expect(result.current.data?.generadoEn).toBe(GENERADO);
    expect(result.current.data?.filas[0].saldos.total).toBe(5);
  });

  it("con filtros nuevos usa otra clave y vuelve a consultar", async () => {
    const queries: string[] = [];
    server.use(
      http.get("/api/insumos/reporte-stock", ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json(respuesta());
      }),
    );

    const { result, rerender } = renderHook(({ f }) => useReporteStock(f), {
      wrapper: crearWrapper(),
      initialProps: { f: {} as Parameters<typeof useReporteStock>[0] },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ f: { esRepuesto: true } });
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries).toEqual(["", "?esRepuesto=true"]);
  });

  it("una respuesta que no calza con el schema queda como error", async () => {
    server.use(
      http.get("/api/insumos/reporte-stock", () => HttpResponse.json({ filas: [] })),
    );
    const { result } = renderHook(() => useReporteStock({}), { wrapper: crearWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
