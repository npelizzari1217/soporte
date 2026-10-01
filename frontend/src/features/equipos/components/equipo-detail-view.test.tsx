import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoDetailView } from "./equipo-detail-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
      insumoId: "11111111-1111-4111-8111-111111111111",
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

  /** WU-8: un solo flujo de alta; el botón «Instalar desde depósito» ya no existe. */
  it("no muestra «Instalar desde depósito»: hay un solo botón de alta", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:ALTAS"] }),
    });

    expect(await screen.findAllByRole("button", { name: /agregar componente/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /instalar desde depósito/i })).not.toBeInTheDocument();
  });
});

describe("EquipoDetailView — borrado de un equipo cargado por error (baja-equipo-completo, R13)", () => {
  beforeEach(() => {
    mockBackend();
    vi.mocked(toast.error).mockClear();
  });

  it("el botón del borrado dice «Eliminar equipo (cargado por error)» y ningún botón dice «Dar de baja»", async () => {
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    expect(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^dar de baja$/i })).not.toBeInTheDocument();
  });

  it("la confirmación aclara que es solo para equipos cargados por error y sugiere dar de baja", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" }));

    expect(
      await screen.findByText(/Solo para equipos cargados por error\. Si tiene piezas instaladas, dalo de baja\./),
    ).toBeInTheDocument();
  });

  it("el 422 del borrado con piezas activas muestra el mensaje del backend con la cantidad", async () => {
    server.use(
      http.delete(`/api/equipos/${EQUIPO_ID}`, () =>
        HttpResponse.json(
          { message: "El equipo tiene 2 piezas activas: dalo de baja en lugar de borrarlo." },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquipoDetailView equipoId={EQUIPO_ID} />, {
      user: buildUser({ permisos: ["EQUIPOS:BORRADO"] }),
    });

    await user.click(await screen.findByRole("button", { name: "Eliminar equipo (cargado por error)" }));
    await user.click(await screen.findByRole("button", { name: "Eliminar equipo" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("2 piezas activas")));
  });
});
