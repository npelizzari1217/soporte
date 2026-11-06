import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../../../test/msw/server";
import { useCrearTarea, useEliminarTarea } from "./use-tareas-ticket";

/**
 * Regresión (odd/edilicia-obra-externa, L13): el detalle publica `modalidadEditable`, que depende de
 * cuántas tareas activas tiene el ticket. Crear o borrar una tarea cambia esa cuenta, así que tiene
 * que invalidar el detalle (`["ticket", id]`). Sin eso, la edición ofrece la modalidad habilitada,
 * el backend responde 422 y el usuario pierde lo que editó.
 */
const TICKET_ID = "t1";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("tareas del ticket — invalidación del detalle", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  const claves = (): unknown[][] =>
    invalidateSpy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown[] }).queryKey);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    invalidateSpy.mockRestore();
  });

  it("crear una tarea invalida el detalle del ticket", async () => {
    server.use(
      http.post(`/api/tickets/${TICKET_ID}/tareas`, () => HttpResponse.json({ id: "x" }, { status: 201 })),
    );
    const { result } = renderHook(() => useCrearTarea(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate({ descripcion: "Pintar" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(claves()).toContainEqual(["ticket", TICKET_ID]);
  });

  it("eliminar una tarea invalida el detalle del ticket", async () => {
    server.use(
      http.delete(`/api/tickets/${TICKET_ID}/tareas/x`, () => new HttpResponse(null, { status: 204 })),
    );
    const { result } = renderHook(() => useEliminarTarea(TICKET_ID), { wrapper: wrapper(queryClient) });

    result.current.mutate("x");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(claves()).toContainEqual(["ticket", TICKET_ID]);
  });
});
