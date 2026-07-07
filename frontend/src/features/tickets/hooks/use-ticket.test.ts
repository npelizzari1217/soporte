/**
 * Tests for useTicket(id) hook (PR1 — ticket-detail-page, ADR-2).
 *
 * TDD RED — written before implementation.
 * MSW intercepts GET /api/tickets/:id — no real network.
 *
 * Key behavior (design ADR-2 — mirrors useCicloActivo):
 *   - 200 → data = Ticket, error = null
 *   - 404 → data = null, error = null  (ticket inexistente u otro tenant — NOT an error)
 *   - 500/red → isError = true, error = ApiError
 *   - no retry on 4xx (retry disabled for statusCode 400-499)
 *
 * Spec: [SPEC:ticket-detail/fetch-de-ticket-por-id-con-estados-explicitos]
 * Design: ADR-2 (ticket-detail-page)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useTicket } from "./use-ticket";
import { ApiError } from "@/shared/api/types";
import type { Ticket } from "../types";
import * as React from "react";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockTicket: Ticket = {
  id: "ticket-uuid-001",
  numero: "SOP-2026-00001",
  titulo: "Impresora no enciende",
  descripcion: "No prende desde ayer",
  tipoId: "tipo-uuid-001",
  estadoId: "estado-uuid-002",
  prioridadId: "prioridad-uuid-001",
  cicloId: "ciclo-uuid-001",
  solicitanteId: "user-uuid-001",
  asignadoId: null,
  fechaCierre: null,
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

describe("useTicket", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
  });

  it("returns ticket data when backend responds 200", async () => {
    server.use(
      http.get("http://localhost/api/tickets/ticket-uuid-001", () =>
        HttpResponse.json(mockTicket),
      ),
    );

    const { result } = renderHook(() => useTicket("ticket-uuid-001"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTicket);
    expect(result.current.error).toBeNull();
  });

  it("returns data=null and error=null when backend responds 404 (inexistente u otro tenant)", async () => {
    server.use(
      http.get("http://localhost/api/tickets/no-existe", () =>
        HttpResponse.json(
          { statusCode: 404, message: "Ticket no encontrado" },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useTicket("no-existe"), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 404 is treated as "not found" state — NOT an error
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns an ApiError when backend responds 500", async () => {
    server.use(
      http.get("http://localhost/api/tickets/ticket-uuid-001", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useTicket("ticket-uuid-001"), {
      wrapper: makeWrapper(qc),
    });

    // useTicket retries 5xx up to 2 times (ADR-2: only 4xx skips retry) — with the
    // default exponential backoff this takes a few seconds, so extend waitFor's timeout.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10000 });
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).statusCode).toBe(500);
    expect(result.current.data).toBeUndefined();
  }, 15000);

  it("does not retry on 4xx responses", async () => {
    let callCount = 0;
    server.use(
      http.get("http://localhost/api/tickets/ticket-uuid-001", () => {
        callCount++;
        return HttpResponse.json(
          { statusCode: 400, message: "Bad Request" },
          { status: 400 },
        );
      }),
    );

    // This QueryClient allows the hook's own `retry` option to govern retries
    // (no global retry:false override) so we exercise useTicket's real retry logic.
    const qcWithDefaultRetry = new QueryClient();

    const { result } = renderHook(() => useTicket("ticket-uuid-001"), {
      wrapper: makeWrapper(qcWithDefaultRetry),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callCount).toBe(1);
  });
});
