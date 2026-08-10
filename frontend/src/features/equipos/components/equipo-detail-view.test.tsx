import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoDetailView } from "./equipo-detail-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const EQUIPO_ID = "44444444-4444-4444-4444-444444444444";

const EQUIPO_DETALLE = {
  id: EQUIPO_ID,
  nombre: "Notebook Dell",
  numeroSerie: "SN-001",
  marca: "Dell",
  modelo: "Latitude",
  fechaAdquisicion: null,
  ubicacionId: null,
  asignadoAId: null,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  componentes: [
    {
      id: "c1",
      equipoId: EQUIPO_ID,
      tipoComponenteCodigo: "RAM",
      tipoNombre: "Memoria RAM",
      tipoActivo: true,
      descripcion: "RAM 16GB",
      numeroSerie: null,
      capacidad: "16GB",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function mockBackend() {
  server.use(
    http.get(`/api/equipos/${EQUIPO_ID}`, () => HttpResponse.json(EQUIPO_DETALLE)),
    http.get("/api/equipos/tipos-componente", () => HttpResponse.json([{ codigo: "RAM", nombre: "Memoria RAM" }])),
    http.get("/api/usuarios", () => HttpResponse.json([])),
  );
}

describe("EquipoDetailView — consume componentes embebidos de GET /equipos/:id (item 1 backend-gaps)", () => {
  beforeEach(() => mockBackend());

  it("renderiza componentes ya existentes SIN necesidad de agregarlos vía mutación", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    expect(await screen.findByText(/memoria ram — 16gb/i)).toBeInTheDocument();
  });
});
