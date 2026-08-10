import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import {
  useAsignarEnProceso,
  useAsignarTicket,
  useComentar,
  useCrearTicket,
  useTransicionarEstado,
} from "./use-ticket-mutations";

/**
 * Regla no obvia (ADR-2): "invalidación tras mutaciones (comentar/
 * transicionar/asignar → invalida detalle+timeline+lista)". Si una mutación
 * NO invalida la query correcta, el usuario ve datos stale hasta el próximo
 * refetch manual — bug silencioso, difícil de notar en review. Se testea
 * el efecto observable (`invalidateQueries`), no el wiring trivial de
 * `useMutation`.
 */
const TICKET_ID = "t1";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function invalidatedQueryKeys(invalidateSpy: ReturnType<typeof vi.spyOn>): unknown[][] {
  return invalidateSpy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown[] }).queryKey);
}

describe("Tickets mutations — invalidación de cache (ADR-2)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
  });

  it("transicionar estado → invalida detalle + timeline + lista", async () => {
    server.use(http.patch(`/api/tickets/${TICKET_ID}/estado`, () => HttpResponse.json({ id: TICKET_ID })));
    const { result } = renderHook(() => useTransicionarEstado(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ nuevoEstadoCodigo: "ASIGNADO" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedQueryKeys(invalidateSpy);
    expect(keys).toContainEqual(["ticket", TICKET_ID]);
    expect(keys).toContainEqual(["ticket", TICKET_ID, "timeline"]);
    expect(keys).toContainEqual(["tickets"]);
  });

  it("asignar ticket → invalida detalle + timeline + lista", async () => {
    server.use(http.patch(`/api/tickets/${TICKET_ID}/asignar`, () => HttpResponse.json({ id: TICKET_ID })));
    const { result } = renderHook(() => useAsignarTicket(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ asignadoId: "u1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedQueryKeys(invalidateSpy);
    expect(keys).toContainEqual(["ticket", TICKET_ID]);
    expect(keys).toContainEqual(["ticket", TICKET_ID, "timeline"]);
    expect(keys).toContainEqual(["tickets"]);
  });

  it("asignar y poner en proceso → invalida detalle + timeline + lista", async () => {
    server.use(
      http.patch(`/api/tickets/${TICKET_ID}/asignar-en-proceso`, () =>
        HttpResponse.json({ id: TICKET_ID }),
      ),
    );
    const { result } = renderHook(() => useAsignarEnProceso(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ asignadoId: "u1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedQueryKeys(invalidateSpy);
    expect(keys).toContainEqual(["ticket", TICKET_ID]);
    expect(keys).toContainEqual(["ticket", TICKET_ID, "timeline"]);
    expect(keys).toContainEqual(["tickets"]);
  });

  it("comentar → invalida detalle + timeline + lista", async () => {
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/comentarios`, () => HttpResponse.json({ id: "op1" }, { status: 201 })),
    );
    const { result } = renderHook(() => useComentar(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ texto: "hola" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidatedQueryKeys(invalidateSpy);
    expect(keys).toContainEqual(["ticket", TICKET_ID]);
    expect(keys).toContainEqual(["ticket", TICKET_ID, "timeline"]);
    expect(keys).toContainEqual(["tickets"]);
  });

  it("crear ticket → invalida SOLO la lista (no hay detalle/timeline previos que invalidar)", async () => {
    server.use(http.post("/api/tickets", () => HttpResponse.json({ id: "nuevo" }, { status: 201 })));
    const { result } = renderHook(() => useCrearTicket(), { wrapper: wrapper(queryClient) });

    result.current.mutate({ titulo: "x", tipoId: "ti1", prioridadId: "p1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidatedQueryKeys(invalidateSpy)).toEqual([["tickets"]]);
  });
});
