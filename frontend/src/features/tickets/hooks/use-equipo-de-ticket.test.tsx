import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useEquipoDeTicket } from "./use-equipo-de-ticket";

/**
 * useEquipoDeTicket — hook que consulta `GET /soporte/:ticketId` SOLO cuando
 * `enabled` es `true` (el detalle de ticket lo habilita únicamente si el
 * ticket es de tipo SOPORTE — no tiene sentido pegarle al endpoint para
 * tickets de otros tipos, que ni siquiera tienen satélite `ticket_soporte`).
 * Ese gate de `enabled` es la única lógica no trivial del hook.
 */
const TICKET_ID = "t1";

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useEquipoDeTicket", () => {
  it("enabled=true → consulta GET /soporte/:ticketId y retorna el equipo", async () => {
    server.use(
      http.get(`/api/soporte/${TICKET_ID}`, () =>
        HttpResponse.json({ equipo: { id: "e1", nombre: "Notebook Dell", numeroSerie: "SN-123" } }),
      ),
    );

    const { result } = renderHook(() => useEquipoDeTicket(TICKET_ID, true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.equipo).toEqual({ id: "e1", nombre: "Notebook Dell", numeroSerie: "SN-123" });
  });

  it("enabled=false → NO consulta el endpoint (query queda idle)", async () => {
    let called = false;
    server.use(
      http.get(`/api/soporte/${TICKET_ID}`, () => {
        called = true;
        return HttpResponse.json({ equipo: null });
      }),
    );

    const { result } = renderHook(() => useEquipoDeTicket(TICKET_ID, false), { wrapper: wrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });
});
