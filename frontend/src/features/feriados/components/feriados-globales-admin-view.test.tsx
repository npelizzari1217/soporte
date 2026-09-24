import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { FeriadosGlobalesAdminView } from "./feriados-globales-admin-view";

const FERIADO_ENERO = { id: "f1", fecha: "2026-01-01", descripcion: "Año Nuevo" };
const FERIADO_MAYO = { id: "f2", fecha: "2026-05-01", descripcion: "Día del Trabajador" };

function mockBackend() {
  // El backend ya ordena por fecha asc (D8, design.md); estos fixtures se
  // mandan fuera de orden para probar que la pantalla NO reordena — renderiza
  // tal cual llega.
  server.use(http.get("/api/feriados", () => HttpResponse.json([FERIADO_ENERO, FERIADO_MAYO])));
}

describe("FeriadosGlobalesAdminView (sdd/feriados-configurables, WU7a)", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["ROOT (is_global_admin)", true, [], true],
    ["ADMINISTRADOR de tenant sin is_global_admin", false, [], false],
  ])("gate de acceso a /admin/feriados-globales es por is_global_admin, NUNCA por permisos — %s", async (_label, isGlobalAdmin, permisos, shouldShowContent) => {
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ permisos, is_global_admin: isGlobalAdmin }) });

    if (shouldShowContent) {
      await screen.findByText("Año Nuevo");
    } else {
      expect(await screen.findByText(/solo.*root/i)).toBeInTheDocument();
      expect(screen.queryByText("Año Nuevo")).not.toBeInTheDocument();
    }
  });

  it("renderiza la lista ordenada por fecha (tal cual la manda el backend), cada fila con el badge verde de origen", async () => {
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });

    await screen.findByText("Año Nuevo");
    const filas = screen.getAllByRole("row").slice(1); // descarta el header
    expect(filas[0]).toHaveTextContent("Año Nuevo");
    expect(filas[1]).toHaveTextContent("Día del Trabajador");

    const badges = screen.getAllByTestId("origen-feriado-badge");
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge).toHaveTextContent("Nacional");
    }
  });

  it("muestra la fecha en formato dd/mm/yyyy, nunca el ISO crudo", async () => {
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("01/01/2026")).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-01-01")).not.toBeInTheDocument();
  });

  it("lista vacía muestra el estado vacío, no un error", async () => {
    server.use(http.get("/api/feriados", () => HttpResponse.json([])));
    renderWithProviders(<FeriadosGlobalesAdminView />, { user: buildUser({ is_global_admin: true }) });

    expect(await screen.findByText("Sin feriados nacionales")).toBeInTheDocument();
  });
});
