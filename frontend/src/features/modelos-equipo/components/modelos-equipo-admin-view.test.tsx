import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ModelosEquipoAdminView } from "./modelos-equipo-admin-view";

/**
 * ModelosEquipoAdminView — molde exacto de
 * `unidades-medida-admin-view.test.tsx`: el gate `it.each` (R1) y el flujo de
 * listar + activar/desactivar (R2). `ModeloEquipoList` no tiene test propio
 * (mismo criterio que `UnidadMedidaList`): su cobertura vive acá.
 */
const MODELO_HP = {
  id: "me-1",
  marca: "HP",
  modelo: "LaserJet Pro M404",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend(modelos: unknown[] = [MODELO_HP]) {
  server.use(http.get("/api/modelos-equipo", () => HttpResponse.json(modelos)));
}

describe("ModelosEquipoAdminView", () => {
  beforeEach(() => {
    mockBackend();
  });

  it.each([
    ["ADMINISTRADOR", "ADMINISTRADOR", true],
    ["TECNICO (no admin, no root)", "TECNICO", false],
  ])("gate de acceso a Admin > Modelos de equipo — %s", async (_label, rol, shouldShowContent) => {
    renderWithProviders(<ModelosEquipoAdminView />, { user: buildUser({ rol }) });

    if (shouldShowContent) {
      await screen.findByText("HP");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("HP")).not.toBeInTheDocument();
    }
  });

  /**
   * La dirección que faltaba (W1 del verify de este ciclo). El escenario R2 de
   * la spec dice GIVEN un modelo ACTIVO / WHEN lo DESACTIVA, y el test de abajo
   * recorre la dirección inversa: arranca en `activo: false` y reactiva.
   *
   * LO QUE ESTE TEST APORTA, medido por mutación en la ronda 2 del verify:
   * cambiar `mutation.mutate({ activo: !modelo.activo })` por `{ activo: true }`
   * en `modelo-equipo-list.tsx` mata **solo a este test**; el hermano pasa,
   * porque `{ activo: true }` es exactamente lo que espera. Antes de esta
   * cobertura ese error quedaba verde.
   *
   * NO lo sostiene invertir el ternario `activo ? "Dar de baja" : "Activar"`:
   * esa mutación es simétrica, cambia las etiquetas en las dos ramas, y el
   * hermano por sí solo también la mata. Queda anotado porque la primera
   * versión de este comentario afirmaba lo contrario.
   *
   * Por qué hace falta acá y no alcanza con el test de otra feature:
   * `EstadoActivoAction` es una función LOCAL de `modelo-equipo-list.tsx`, y
   * el patrón está duplicado en seis listas del repo, cada una con su propia
   * copia.
   */
  it("da de baja un modelo activo desde la lista", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    // El GET refleja la baja: sin esto el refetch posterior al PATCH devolvería
    // el estado viejo y el badge nunca cambiaría, que es lo que se está
    // probando. El test hermano no lo necesita porque no afirma la UI.
    let activo = true;
    server.use(
      http.get("/api/modelos-equipo", () => HttpResponse.json([{ ...MODELO_HP, activo }])),
      http.patch("/api/modelos-equipo/me-1/estado", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        activo = (enviado as { activo: boolean }).activo;
        return HttpResponse.json({ ...MODELO_HP, activo });
      }),
    );

    renderWithProviders(<ModelosEquipoAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("HP");
    expect(screen.getByText("Activo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^dar de baja$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^dar de baja$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: false }));
    expect(await screen.findByText("Baja")).toBeInTheDocument();
  });

  it("lista el catálogo y reactiva un modelo dado de baja", async () => {
    const user = userEvent.setup();
    mockBackend([{ ...MODELO_HP, activo: false }]);
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/modelos-equipo/me-1/estado", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...MODELO_HP, activo: true });
      }),
    );

    renderWithProviders(<ModelosEquipoAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("HP");

    await user.click(screen.getByRole("button", { name: /^activar$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^activar$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: true }));
  });

  it("crea un modelo desde la vista y lo muestra en la lista", async () => {
    const user = userEvent.setup();
    let modelos: Record<string, unknown>[] = [MODELO_HP];
    server.use(
      http.get("/api/modelos-equipo", () => HttpResponse.json(modelos)),
      http.post("/api/modelos-equipo", async ({ request }) => {
        const dto = (await request.json()) as Record<string, unknown>;
        const nuevo = {
          id: "me-2",
          marca: dto.marca,
          modelo: dto.modelo,
          activo: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
        modelos = [...modelos, nuevo];
        return HttpResponse.json(nuevo, { status: 201 });
      }),
    );

    renderWithProviders(<ModelosEquipoAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("HP");

    await user.click(screen.getByRole("button", { name: /nuevo modelo de equipo/i }));
    await user.type(screen.getByLabelText("Marca"), "epson");
    await user.type(screen.getByLabelText("Modelo"), "L3250");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    expect(await screen.findByText("EPSON")).toBeInTheDocument();
    expect(screen.getByText("L3250")).toBeInTheDocument();
  });
});
