import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useEditarPlanPreventivo } from "./use-planes-preventivo-mutations";
import type { EditarPlanPreventivoDto, PlanPreventivo } from "../types";

/**
 * `useEditarPlanPreventivo` (EP-R1) — `PATCH /preventivo/planes/:id`, invalida
 * `["preventivo","planes"]` en `onSuccess`. La fecha `proximaEjecucionEn` de
 * la RESPUESTA del PATCH queda vieja cuando cambia la cadencia (ADR-7,
 * "Fuera de alcance" en tasks.md); este test no la usa como fuente de verdad,
 * solo confirma el método HTTP y la invalidación.
 */
const PLAN_ID = "77777777-7777-7777-7777-777777777777";

const PLAN_FIXTURE: PlanPreventivo = {
  id: PLAN_ID,
  titulo: "Revisión mensual",
  instrucciones: null,
  equipoId: null,
  ubicacion: "DEPOSITO",
  prioridadId: "p1",
  responsableId: "u1",
  intervaloValor: 1,
  intervaloUnidad: "MESES",
  fechaInicio: "2026-01-01",
  proximaEjecucionEn: "2026-04-01",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false } } });
}

describe("useEditarPlanPreventivo", () => {
  it("hace PATCH /preventivo/planes/:id e invalida el listado en onSuccess", async () => {
    let metodoUsado = "";
    server.use(
      http.patch(`/api/preventivo/planes/${PLAN_ID}`, ({ request }) => {
        metodoUsado = request.method;
        return HttpResponse.json(PLAN_FIXTURE);
      }),
    );
    const queryClient = buildClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useEditarPlanPreventivo(PLAN_ID), { wrapper: wrapper(queryClient) });
    const dto: EditarPlanPreventivoDto = { titulo: "Título editado", activo: true };
    result.current.mutate(dto);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(metodoUsado).toBe("PATCH");
    const keys = invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["preventivo", "planes"]);
    invalidateSpy.mockRestore();
  });
});
