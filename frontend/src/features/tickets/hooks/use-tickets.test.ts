/**
 * Tests for useTickets hook (PR4 — T4.3).
 *
 * TDD RED — written before implementation.
 * MSW intercepts GET /api/tickets — no real network.
 *
 * Asserts:
 *   1. Filtros are appended as query params in the network request.
 *   2. Empty filtros produce a clean URL (no query string).
 *   3. Different filtros objects produce different queryKeys (cache isolation).
 *   4. enabled=false prevents any network request.
 *
 * Spec: ADR-7 (tickets-list-filtros-resolucion)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useTickets } from "./use-tickets";
import { queryKeys } from "@/shared/api/query-keys";
import type { TicketFiltros } from "../types";
import type { Ticket } from "../types";
import * as React from "react";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const soporte = "e0000000-0000-4000-e000-000000000001";
const compras = "e0000000-0000-4000-e000-000000000002";

const ticketFixture: Ticket = {
  id: "ticket-1",
  numero: "SOP-2026-00001",
  titulo: "Test ticket",
  descripcion: null,
  tipoId: soporte,
  estadoId: "c0000000-0000-4000-c000-000000000001",
  prioridadId: "d0000000-0000-4000-d000-000000000003",
  cicloId: null,
  solicitanteId: "user-1",
  asignadoId: null,
  fechaResolucion: null,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useTickets", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
  });

  it("calls GET /api/tickets with tiposIds as repeated query params", async () => {
    let capturedUrl = "";
    server.use(
      http.get("http://localhost/api/tickets", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([ticketFixture]);
      }),
    );

    const filtros: TicketFiltros = {
      tiposIds: [soporte, compras],
    };

    const { result } = renderHook(() => useTickets(filtros), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain("tiposIds");
    expect(capturedUrl).toContain(soporte);
    expect(capturedUrl).toContain(compras);
  });

  it("calls GET /api/tickets with fechaDesde and fechaHasta params", async () => {
    let capturedUrl = "";
    server.use(
      http.get("http://localhost/api/tickets", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([ticketFixture]);
      }),
    );

    const filtros: TicketFiltros = {
      fechaDesde: "2026-01-01",
      fechaHasta: "2026-06-30",
    };

    const { result } = renderHook(() => useTickets(filtros), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain("fechaDesde=2026-01-01");
    expect(capturedUrl).toContain("fechaHasta=2026-06-30");
  });

  it("calls GET /api/tickets without query string when filtros is empty", async () => {
    let capturedUrl = "";
    server.use(
      http.get("http://localhost/api/tickets", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useTickets({}), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // No query string — URL ends with /api/tickets
    expect(capturedUrl).toMatch(/\/api\/tickets$/);
  });

  it("produces distinct queryKeys for different filtros", () => {
    const filtrosA: TicketFiltros = { tiposIds: [soporte] };
    const filtrosB: TicketFiltros = { tiposIds: [compras] };

    // The hook uses queryKeys.tickets.list(filtros) which includes the filtros object
    // as the 3rd element. Different filtros → different keys.
    const keyA = queryKeys.tickets.list(filtrosA);
    const keyB = queryKeys.tickets.list(filtrosB);

    expect(keyA).not.toEqual(keyB);
    // Both share the same prefix (for prefix-based invalidation)
    expect(keyA[0]).toBe("tickets");
    expect(keyB[0]).toBe("tickets");
  });

  it("does NOT call the API when enabled is false", async () => {
    const handler = vi.fn(() => HttpResponse.json([]));
    server.use(
      http.get("http://localhost/api/tickets", handler),
    );

    const { result } = renderHook(() => useTickets({}, false), {
      wrapper: makeWrapper(qc),
    });

    // Wait a tick to ensure no accidental fetch
    await new Promise((r) => setTimeout(r, 50));
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
