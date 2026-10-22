import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import {
  useAsignarEnProceso,
  useAsignarTicket,
  useBorrarTicket,
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

  // odd/permisos-por-tipo-ticket, L45: el detalle de un ticket borrado responde 404. Si su caché
  // sobrevive, volver a él (atrás del navegador, un enlace) muestra el ticket como si existiera.
  it("borrar ticket → descarta de la caché su detalle y su timeline, e invalida la lista", async () => {
    server.use(http.delete(`/api/tickets/${TICKET_ID}`, () => new HttpResponse(null, { status: 204 })));
    queryClient.setQueryData(["ticket", TICKET_ID], { id: TICKET_ID });
    queryClient.setQueryData(["ticket", TICKET_ID, "timeline"], []);
    queryClient.setQueryData(["ticket", "t2"], { id: "t2" });
    queryClient.setQueryData(["ticket", "t2", "timeline"], []);
    const { result } = renderHook(() => useBorrarTicket(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryCache().find({ queryKey: ["ticket", TICKET_ID], exact: true })).toBeUndefined();
    expect(
      queryClient.getQueryCache().find({ queryKey: ["ticket", TICKET_ID, "timeline"], exact: true }),
    ).toBeUndefined();
    // Los otros tickets no se tocan.
    expect(queryClient.getQueryData(["ticket", "t2"])).toEqual({ id: "t2" });
    expect(queryClient.getQueryData(["ticket", "t2", "timeline"])).toEqual([]);
    expect(invalidatedQueryKeys(invalidateSpy)).toContainEqual(["tickets"]);
  });

  it("borrar ticket con error → el detalle sigue en la caché", async () => {
    server.use(
      http.delete(`/api/tickets/${TICKET_ID}`, () =>
        HttpResponse.json({ statusCode: 422, message: "No se puede borrar" }, { status: 422 }),
      ),
    );
    queryClient.setQueryData(["ticket", TICKET_ID], { id: TICKET_ID });
    const { result } = renderHook(() => useBorrarTicket(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(["ticket", TICKET_ID])).toEqual({ id: TICKET_ID });
  });
});
