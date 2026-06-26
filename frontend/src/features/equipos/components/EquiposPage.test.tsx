/**
 * EquiposPage integration tests (RTL + MSW).
 *
 * Tests the connected page behavior: EquiposPage uses useEquipos (useQuery) which
 * calls apiFetch('equipos'). MSW intercepts /api/equipos same-origin (jsdom http://localhost/).
 *
 * Covers:
 *   - loading → skeleton rows visible
 *   - success (2+ equipos) → nombre, marca, modelo, numeroSerie, activo badge rendered
 *   - success → null fields show "—" fallback
 *   - empty array → EmptyState visible
 *   - error (500) → error message + retry button
 *
 * Spec: [SPEC:frontend-equipos/lista-equipos]
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "../../../../test/msw/server";
import EquiposPage from "@/app/(dashboard)/equipos/page";
import type { Equipo } from "../types";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockEquipos: Equipo[] = [
  {
    id: "equipo-1",
    nombre: "Laptop Dell XPS",
    numeroSerie: "SN-DELL-001",
    marca: "Dell",
    modelo: "XPS 15",
    fechaAdquisicion: "2024-03-10T00:00:00Z",
    ubicacionId: "ubic-1",
    asignadoAId: "user-1",
    activo: true,
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: "2024-03-10T10:00:00Z",
  },
  {
    id: "equipo-2",
    nombre: "Impresora HP LaserJet",
    numeroSerie: null,
    marca: "HP",
    modelo: null,
    fechaAdquisicion: null,
    ubicacionId: null,
    asignadoAId: null,
    activo: false,
    createdAt: "2023-05-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z",
  },
];

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderEquiposPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <EquiposPage />
    </QueryClientProvider>,
  );
  return { container, queryClient };
}

describe("EquiposPage", () => {
  // ─── Loading ────────────────────────────────────────────────────────────────

  it("loading: renders skeleton rows while fetch is pending", () => {
    server.use(
      http.get("http://localhost/api/equipos", () => new Promise(() => {})),
    );

    const { container } = renderEquiposPage();

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);

    expect(screen.queryByText("Laptop Dell XPS")).not.toBeInTheDocument();
  });

  // ─── Success ────────────────────────────────────────────────────────────────

  it("success: renders equipo rows with nombre, marca, modelo and activo badge", async () => {
    server.use(
      http.get("http://localhost/api/equipos", () =>
        HttpResponse.json(mockEquipos),
      ),
    );

    renderEquiposPage();

    await screen.findByText("Laptop Dell XPS");

    expect(screen.getByText("Impresora HP LaserJet")).toBeInTheDocument();

    // Marca and modelo
    expect(screen.getByText("Dell")).toBeInTheDocument();
    expect(screen.getByText("XPS 15")).toBeInTheDocument();
    expect(screen.getByText("HP")).toBeInTheDocument();

    // Serial number
    expect(screen.getByText("SN-DELL-001")).toBeInTheDocument();

    // Activo badges
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("success: null fields show '—' fallback", async () => {
    server.use(
      http.get("http://localhost/api/equipos", () =>
        HttpResponse.json(mockEquipos),
      ),
    );

    renderEquiposPage();

    await screen.findByText("Laptop Dell XPS");

    // Equipo-2 has null numeroSerie, modelo, fechaAdquisicion → at least one "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Empty ──────────────────────────────────────────────────────────────────

  it("empty: renders EmptyState when API returns empty array", async () => {
    server.use(
      http.get("http://localhost/api/equipos", () => HttpResponse.json([])),
    );

    renderEquiposPage();

    await screen.findByText("No hay equipos registrados");
    expect(screen.queryByText("Laptop Dell XPS")).not.toBeInTheDocument();
  });

  // ─── Error ──────────────────────────────────────────────────────────────────

  it("error: renders error message and retry button on 500", async () => {
    server.use(
      http.get("http://localhost/api/equipos", () =>
        HttpResponse.json(
          { statusCode: 500, message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderEquiposPage();

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
