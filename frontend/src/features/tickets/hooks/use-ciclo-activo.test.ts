/**
 * Tests for useCicloActivo hook (PR4 — T4.6).
 *
 * TDD RED — written before implementation.
 * MSW intercepts GET /api/tickets/ciclo-activo — no real network.
 *
 * Key behavior (spec + ADR-8):
 *   - 200 → data = CicloActivo, error = null
 *   - 404 → data = null, error = null  (404 = "no hay ciclo activo", NOT an error)
 *   - 500 → error = ApiError(500), data = undefined
 *
 * The 404→null mapping is intentional: useCicloActivo consumers treat ciclo===null
 * as the "sin ciclo" state and render the blocking popup/alert accordingly.
 *
 * Spec: ADR-8 (tickets-list-filtros-resolucion)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useCicloActivo } from "./use-ciclo-activo";
import { ApiError } from "@/shared/api/types";
import type { CicloActivo } from "../types";
import * as React from "react";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockCiclo: CicloActivo = {
  id: "ciclo-uuid-001",
  nombre: "Ciclo 2026",
  fechaInicio: "2026-01-01",
  fechaFin: "2026-12-31",
  activo: true,
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

describe("useCicloActivo", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
  });

  it("returns ciclo data when backend responds 200", async () => {
    server.use(
      http.get("http://localhost/api/tickets/ciclo-activo", () =>
        HttpResponse.json(mockCiclo),
      ),
    );

    const { result } = renderHook(() => useCicloActivo(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCiclo);
    expect(result.current.error).toBeNull();
  });

  it("returns data=null and error=null when backend responds 404 (no active cycle)", async () => {
    server.use(
      http.get("http://localhost/api/tickets/ciclo-activo", () =>
        HttpResponse.json(
          { statusCode: 404, message: "No hay ciclo activo" },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useCicloActivo(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 404 is treated as valid "no ciclo" state — NOT an error
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns an ApiError when backend responds 500", async () => {
    server.use(
      http.get("http://localhost/api/tickets/ciclo-activo", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useCicloActivo(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).statusCode).toBe(500);
    expect(result.current.data).toBeUndefined();
  });
});
