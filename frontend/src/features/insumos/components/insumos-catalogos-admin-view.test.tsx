import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { InsumosCatalogosAdminView } from "./insumos-catalogos-admin-view";

/**
 * InsumosCatalogosAdminView — mismo patrón que
 * `features/catalogos/components/catalogos-admin-view.test.tsx`: gate por
 * rol (`SoloAdminCliente`, ADR-P5) y flujo de listar/crear/dar de baja de
 * familias.
 *
 * Issue #156: las unidades de medida se mudaron a `Admin -> Unidades`
 * (`unidades-medida-admin-view.test.tsx`); esta suite solo cubre lo que
 * QUEDA acá (familias) más el assert negativo de que el bloque de unidades
 * ya no se renderiza.
 */
const FAMILIA_TONER = {
  id: "fam-1",
  codigo: "TONER",
  nombre: "Tóner",
  activo: true,
  // El endpoint siempre devuelve esRepuesto; el Tóner es consumible, no repuesto.
  esRepuesto: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(http.get("/api/familias-insumo", () => HttpResponse.json([FAMILIA_TONER])));
}

describe("InsumosCatalogosAdminView", () => {
  beforeEach(() => {
    mockBackend();
  });

  it.each([
    ["ADMINISTRADOR", "ADMINISTRADOR", true],
    ["TECNICO (no admin, no root)", "TECNICO", false],
  ])("gate de acceso a Admin > Insumos — %s", async (_label, rol, shouldShowContent) => {
    renderWithProviders(<InsumosCatalogosAdminView />, { user: buildUser({ rol }) });

    if (shouldShowContent) {
      await screen.findByText("TONER");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("TONER")).not.toBeInTheDocument();
    }
  });

  it("tab Familias lista el catálogo y permite crear una nueva", async () => {
    const user = userEvent.setup();
    let creado: Record<string, unknown> = {};
    server.use(
      http.post("/api/familias-insumo", async ({ request }) => {
        creado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { ...FAMILIA_TONER, id: "fam-2", codigo: creado.codigo, nombre: creado.nombre },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<InsumosCatalogosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("TONER");

    await user.click(screen.getByRole("button", { name: /nueva familia/i }));
    await user.type(screen.getByLabelText("Código"), "CARTUCHO");
    await user.type(screen.getByLabelText("Nombre"), "Cartucho");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(creado).toEqual({ codigo: "CARTUCHO", nombre: "Cartucho", esRepuesto: false }),
    );
  });

  it("familias: dar de baja pide confirmación y envía { activo: false }", async () => {
    const user = userEvent.setup();
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/familias-insumo/fam-1/estado", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...FAMILIA_TONER, activo: false });
      }),
    );

    renderWithProviders(<InsumosCatalogosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("TONER");

    await user.click(screen.getByRole("button", { name: /^dar de baja$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/¿confirmás dar de baja "tóner"\?/i)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: /^dar de baja$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: false }));
  });

  /**
   * El gemelo invertido del issue #156: `Admin -> Insumos` ya NO muestra el
   * bloque de unidades de medida (ni su tab, ni su tabla), mientras el resto
   * de sus catálogos (familias) sigue intacto.
   */
  it("ya no muestra el bloque de unidades de medida, y las familias siguen intactas", async () => {
    renderWithProviders(<InsumosCatalogosAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });

    await screen.findByText("TONER");
    expect(screen.queryByRole("tab", { name: /unidades de medida/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nueva unidad/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/unidades de medida/i)).not.toBeInTheDocument();
  });
});
