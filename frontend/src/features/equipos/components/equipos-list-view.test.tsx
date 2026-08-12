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

  it("con ticket:crear pero SIN módulo SOPORTE → el botón NO se muestra", async () => {
    // El endpoint POST /soporte exige @RequireModulo('SOPORTE'); sin el módulo,
    // el botón daba 403 al enviar. Debe ocultarse (regresión del LEAK).
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["ticket:crear"], modulos: ["EQUIPOS"] }),
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: BOTON })).not.toBeInTheDocument(),
    );
  });

  it("con ticket:crear Y módulo SOPORTE → el botón se muestra", async () => {
    mockEquipos();
    renderWithProviders(<EquiposListView />, {
      user: buildUser({ permisos: ["ticket:crear"], modulos: ["EQUIPOS", "SOPORTE"] }),
    });
    expect(await screen.findByRole("button", { name: BOTON })).toBeInTheDocument();
  });
});
