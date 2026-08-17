import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquiposListView } from "./equipos-list-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

/** El inventario se consulta siempre (sin gate de permiso backend). */
function mockEquipos() {
  server.use(http.get("/api/equipos", () => HttpResponse.json([])));
}

describe("EquiposListView — gate del botón «Nuevo ticket de soporte»", () => {
  const BOTON = /nuevo ticket de soporte/i;

  it("con TICKETS:ALTAS pero SIN módulo TICKETS → el botón NO se muestra", async () => {
    // El endpoint POST /soporte exige @RequiereAcciones('TICKETS:ALTAS') (WU-7.3);
    // sin el módulo, el botón daba 403 al enviar. Debe ocultarse (regresión del LEAK).
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["TICKETS:ALTAS"], modulos: ["EQUIPOS"] }),
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: BOTON })).not.toBeInTheDocument(),
    );
  });

  it("con TICKETS:ALTAS Y módulo TICKETS → el botón se muestra", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["TICKETS:ALTAS"], modulos: ["EQUIPOS", "TICKETS"] }),
    });
    expect(await screen.findByRole("button", { name: BOTON })).toBeInTheDocument();
  });
});

// WU-7.6: el gate de ACCESO al inventario pasa a EQUIPOS:LECTURA (no
// EQUIPOS:ALTAS, deviación declarada vs. el mapeo mecánico del design) — un
// lector sin permiso de alta debe VER la tabla igual, solo sin el botón
// "Nuevo equipo".
describe("EquiposListView — gate del inventario (EQUIPOS:LECTURA/ALTAS)", () => {
  it("sin EQUIPOS:LECTURA → no ve el inventario", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, { user: buildUser({ permisos: [] }) });
    expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
  });

  it("con EQUIPOS:LECTURA pero SIN EQUIPOS:ALTAS → ve la tabla, NO ve «Nuevo equipo»", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["EQUIPOS:LECTURA"] }),
    });
    await waitFor(() => expect(screen.queryByText(/no tenés permiso/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /nuevo equipo/i })).not.toBeInTheDocument();
  });

  it("con EQUIPOS:LECTURA Y EQUIPOS:ALTAS → ve «Nuevo equipo»", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["EQUIPOS:LECTURA", "EQUIPOS:ALTAS"] }),
    });
    expect(await screen.findByRole("button", { name: /nuevo equipo/i })).toBeInTheDocument();
  });
});
