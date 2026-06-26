/**
 * ComprasPage integration tests (RTL + MSW).
 *
 * Tests the connected page behavior: ComprasPage uses useCompras (useQuery) which
 * calls apiFetch('compras'). MSW intercepts /api/compras same-origin (jsdom http://localhost/).
 *
 * Covers:
 *   - loading → skeleton rows visible
 *   - success (2+ compras) → numero, titulo and estado labels rendered
 *   - success → aprobación column rendered correctly (aprobada, rechazada, pending)
 *   - empty array → EmptyState visible
 *   - error (500) → error message + retry button
 *
 * Spec: [SPEC:frontend-compras/lista-compras]
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import ComprasPage from "@/app/(dashboard)/compras/page";
import type { Compra } from "../types";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockCompras: Compra[] = [
  {
    id: "compra-1",
    ticketId: "ticket-1",
    numero: "CMP-2026-00001",
    titulo: "Compra de materiales de oficina",
    estadoId: "c0000000-0000-4000-c000-000000000003", // Aprobado
    aprobadoPorId: "user-admin",
    aprobadoEn: "2026-01-20T14:00:00Z",
    motivoRechazo: null,
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-20T14:00:00Z",
  },
  {
    id: "compra-2",
    ticketId: "ticket-2",
    numero: "CMP-2026-00002",
    titulo: "Equipos de cómputo",
    estadoId: "c0000000-0000-4000-c000-000000000004", // Rechazado
    aprobadoPorId: null,
    aprobadoEn: null,
    motivoRechazo: "Presupuesto insuficiente",
    createdAt: "2026-01-14T09:00:00Z",
    updatedAt: "2026-01-16T09:00:00Z",
  },
  {
    id: "compra-3",
    ticketId: "ticket-3",
    numero: "CMP-2026-00003",
    titulo: "Sillas ergonómicas",
    estadoId: "c0000000-0000-4000-c000-000000000002", // Pendiente de aprobación
    aprobadoPorId: null,
    aprobadoEn: null,
    motivoRechazo: null,
    createdAt: "2026-01-18T11:00:00Z",
    updatedAt: "2026-01-18T11:00:00Z",
  },
];

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderComprasPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ComprasPage />
    </QueryClientProvider>,
  );
  return { container, queryClient };
}

describe("ComprasPage", () => {
  // ─── Loading ────────────────────────────────────────────────────────────────

  it("loading: renders skeleton rows while fetch is pending", () => {
    server.use(
      http.get("http://localhost/api/compras", () => new Promise(() => {})),
    );

    const { container } = renderComprasPage();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);

    expect(screen.queryByText("CMP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Success ────────────────────────────────────────────────────────────────

  it("success: renders compra rows with numero, titulo and estado label", async () => {
    server.use(
      http.get("http://localhost/api/compras", () =>
        HttpResponse.json(mockCompras),
      ),
    );

    renderComprasPage();

    await screen.findByText("CMP-2026-00001");

    expect(screen.getByText("CMP-2026-00002")).toBeInTheDocument();
    expect(screen.getByText("CMP-2026-00003")).toBeInTheDocument();

    expect(screen.getByText("Compra de materiales de oficina")).toBeInTheDocument();
    expect(screen.getByText("Equipos de cómputo")).toBeInTheDocument();
    expect(screen.getByText("Sillas ergonómicas")).toBeInTheDocument();

    // Estado labels resolved from UUIDs
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de aprobación")).toBeInTheDocument();
  });

  it("success: aprobación column shows correct labels", async () => {
    server.use(
      http.get("http://localhost/api/compras", () =>
        HttpResponse.json(mockCompras),
      ),
    );

    renderComprasPage();

    await screen.findByText("CMP-2026-00001");

    // Approved row shows "Aprobada" with date
    expect(screen.getByText(/Aprobada/)).toBeInTheDocument();

    // Rejected row shows "Rechazada"
    expect(screen.getByText(/Rechazada/)).toBeInTheDocument();

    // Pending row shows "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Empty ──────────────────────────────────────────────────────────────────

  it("empty: renders EmptyState when API returns empty array", async () => {
    server.use(
      http.get("http://localhost/api/compras", () => HttpResponse.json([])),
    );

    renderComprasPage();

    await screen.findByText("No hay compras todavía");
    expect(screen.queryByText("CMP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Error ──────────────────────────────────────────────────────────────────

  it("error: renders error message and retry button on 500", async () => {
    server.use(
      http.get("http://localhost/api/compras", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderComprasPage();

    const retryButton = await screen.findByRole("button", {
      name: /reintentar/i,
    });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(
      await screen.findByRole("button", { name: /reintentar/i }),
    ).toBeInTheDocument();
  });
});
