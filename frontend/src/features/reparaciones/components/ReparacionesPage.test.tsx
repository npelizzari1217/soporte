/**
 * ReparacionesPage integration tests (RTL + MSW).
 *
 * Tests the connected page behavior: ReparacionesPage uses useReparaciones (useQuery) which
 * calls apiFetch('reparaciones'). MSW intercepts /api/reparaciones same-origin (jsdom http://localhost/).
 *
 * Covers:
 *   - loading → skeleton rows visible
 *   - success (2+ reparaciones) → numero, titulo, ubicacion and estado labels rendered
 *   - success → porcentajeAvance displayed
 *   - empty array → EmptyState visible
 *   - error (500) → error message + retry button
 *
 * Spec: [SPEC:frontend-reparaciones/lista-reparaciones]
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import ReparacionesPage from "@/app/(dashboard)/reparaciones/page";
import type { Reparacion } from "../types";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockReparaciones: Reparacion[] = [
  {
    id: "rep-1",
    ticketId: "ticket-1",
    numero: "REP-2026-00001",
    titulo: "Reparación de cañería",
    estadoId: "c0000000-0000-4000-c000-000000000005", // En progreso
    ubicacionId: "ubic-1",
    ubicacionNombre: "Planta Baja",
    porcentajeAvance: 60,
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-15T08:00:00Z",
  },
  {
    id: "rep-2",
    ticketId: "ticket-2",
    numero: "REP-2026-00002",
    titulo: "Pintura de fachada",
    estadoId: "c0000000-0000-4000-c000-000000000001", // Abierto
    ubicacionId: "ubic-2",
    ubicacionNombre: null,
    porcentajeAvance: 0,
    createdAt: "2026-01-12T09:00:00Z",
    updatedAt: "2026-01-12T09:00:00Z",
  },
];

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderReparacionesPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ReparacionesPage />
    </QueryClientProvider>,
  );
  return { container, queryClient };
}

describe("ReparacionesPage", () => {
  // ─── Loading ────────────────────────────────────────────────────────────────

  it("loading: renders skeleton rows while fetch is pending", () => {
    server.use(
      http.get("http://localhost/api/reparaciones", () => new Promise(() => {})),
    );

    const { container } = renderReparacionesPage();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);

    expect(screen.queryByText("REP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Success ────────────────────────────────────────────────────────────────

  it("success: renders reparacion rows with numero, titulo, ubicacion and estado label", async () => {
    server.use(
      http.get("http://localhost/api/reparaciones", () =>
        HttpResponse.json(mockReparaciones),
      ),
    );

    renderReparacionesPage();

    await screen.findByText("REP-2026-00001");

    expect(screen.getByText("REP-2026-00002")).toBeInTheDocument();

    expect(screen.getByText("Reparación de cañería")).toBeInTheDocument();
    expect(screen.getByText("Pintura de fachada")).toBeInTheDocument();

    // Ubicacion: nombre when present, "—" fallback
    expect(screen.getByText("Planta Baja")).toBeInTheDocument();
    // The null ubicacion shows "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);

    // Estado labels
    expect(screen.getByText("En progreso")).toBeInTheDocument();
    expect(screen.getByText("Abierto")).toBeInTheDocument();
  });

  it("success: renders porcentajeAvance as percentage text", async () => {
    server.use(
      http.get("http://localhost/api/reparaciones", () =>
        HttpResponse.json(mockReparaciones),
      ),
    );

    renderReparacionesPage();

    await screen.findByText("REP-2026-00001");

    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  // ─── Empty ──────────────────────────────────────────────────────────────────

  it("empty: renders EmptyState when API returns empty array", async () => {
    server.use(
      http.get("http://localhost/api/reparaciones", () => HttpResponse.json([])),
    );

    renderReparacionesPage();

    await screen.findByText("No hay reparaciones todavía");
    expect(screen.queryByText("REP-2026-00001")).not.toBeInTheDocument();
  });

  // ─── Error ──────────────────────────────────────────────────────────────────

  it("error: renders error message and retry button on 500", async () => {
    server.use(
      http.get("http://localhost/api/reparaciones", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderReparacionesPage();

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
