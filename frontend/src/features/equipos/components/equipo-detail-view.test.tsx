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
      activo: true,
      deletedAt: null,
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
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    expect(await screen.findByText("Memoria RAM")).toBeInTheDocument();
    expect(screen.getByText("16GB")).toBeInTheDocument();
  });

  it("muestra el botón «Agregar componente» del toolbar (único, WU3 retiró el form inline), con permiso equipo:gestionar", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS", "EQUIPOS:MODIFICACION", "EQUIPOS:BORRADO"] }),
    });

    // Un solo botón "Agregar componente": el trigger del toolbar. El form
    // inline de `EquipoComponentesSection` fue retirado en WU3/PR-B.
    const botones = await screen.findAllByRole("button", { name: /agregar componente/i });
    expect(botones).toHaveLength(1);
  });

  it("oculta el botón «Agregar componente» del toolbar sin permiso equipo:gestionar", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: [] }),
    });

    await screen.findByText("Notebook Dell");
    expect(screen.queryByRole("button", { name: /agregar componente/i })).not.toBeInTheDocument();
  });

  /** WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153): gate idéntico a "Agregar componente" (EQUIPOS:ALTAS). */
  it("muestra «Instalar desde depósito» con EQUIPOS:ALTAS y lo oculta sin ese permiso", async () => {
    const { unmount } = renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    expect(
      await screen.findByRole("button", { name: /instalar desde depósito/i }),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: [] }),
    });
    await screen.findByText("Notebook Dell");
    expect(screen.queryByRole("button", { name: /instalar desde depósito/i })).not.toBeInTheDocument();
  });
});
