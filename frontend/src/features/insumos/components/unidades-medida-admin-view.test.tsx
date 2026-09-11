import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UnidadesMedidaAdminView } from "./unidades-medida-admin-view";
import { InsumoFormDialog } from "./insumo-form-dialog";

/**
 * UnidadesMedidaAdminView (issue #156) — el ABM de unidades de medida se
 * mudó de tab dentro de `Admin -> Insumos` a esta sección propia
 * (`Admin -> Unidades`), MISMO gate (`esAdminCliente`), MISMA conducta.
 *
 * El gate y el flujo de listar/reactivar son el mismo assert que ya cubría
 * `insumos-catalogos-admin-view.test.tsx` cuando el ABM vivía adentro de la
 * tab "Unidades de medida" — se mueven acá, no se duplican ni se borran.
 */
const UNIDAD_UN = {
  id: "um-1",
  codigo: "UN",
  nombre: "Unidad",
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend(unidades: unknown[] = [UNIDAD_UN]) {
  server.use(http.get("/api/unidades-medida", () => HttpResponse.json(unidades)));
}

describe("UnidadesMedidaAdminView", () => {
  beforeEach(() => {
    mockBackend();
  });

  it.each([
    ["ADMINISTRADOR", "ADMINISTRADOR", true],
    ["TECNICO (no admin, no root)", "TECNICO", false],
  ])("gate de acceso a Admin > Unidades — %s", async (_label, rol, shouldShowContent) => {
    renderWithProviders(<UnidadesMedidaAdminView />, { user: buildUser({ rol }) });

    if (shouldShowContent) {
      await screen.findByText("UN");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("UN")).not.toBeInTheDocument();
    }
  });

  it("lista el catálogo y reactiva una unidad dada de baja", async () => {
    const user = userEvent.setup();
    mockBackend([{ ...UNIDAD_UN, activo: false }]);
    let enviado: Record<string, unknown> = {};
    server.use(
      http.patch("/api/unidades-medida/um-1/estado", async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...UNIDAD_UN, activo: true });
      }),
    );

    renderWithProviders(<UnidadesMedidaAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("UN");

    await user.click(screen.getByRole("button", { name: /^activar$/i }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: /^activar$/i }));

    await waitFor(() => expect(enviado).toEqual({ activo: true }));
  });

  /**
   * EL GEMELO INVERTIDO del issue #156: una unidad creada desde
   * `Admin -> Unidades` aparece en el desplegable del alta de insumo. Si la
   * sección nueva no alimenta el alta, el cambio no sirve de nada — es
   * exactamente el bloqueo que motivó el issue (desplegable vacío, sin forma
   * obvia de saber adónde ir a crear una).
   *
   * `UnidadesMedidaAdminView` e `InsumoFormDialog` se montan por separado,
   * cada uno con su propio QueryClient (mismo criterio que
   * `renderWithProviders`): lo único que comparten es el backend simulado
   * (el array `unidades`, mutado por el POST). Así el test prueba que las
   * dos pantallas hablan con el MISMO catálogo, no que compartan caché.
   */
  it("una unidad creada desde Admin > Unidades aparece en el desplegable del alta de insumo", async () => {
    const user = userEvent.setup();
    let unidades: Record<string, unknown>[] = [UNIDAD_UN];
    server.use(
      http.get("/api/unidades-medida", () => HttpResponse.json(unidades)),
      http.get("/api/familias-insumo", () => HttpResponse.json([])),
      http.post("/api/unidades-medida", async ({ request }) => {
        const dto = (await request.json()) as Record<string, unknown>;
        const nueva = {
          id: "um-2",
          codigo: dto.codigo,
          nombre: dto.nombre,
          activo: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
        unidades = [...unidades, nueva];
        return HttpResponse.json(nueva, { status: 201 });
      }),
    );

    const { unmount } = renderWithProviders(<UnidadesMedidaAdminView />, { user: buildUser({ rol: "ADMINISTRADOR" }) });
    await screen.findByText("Unidad");

    await user.click(screen.getByRole("button", { name: /nueva unidad/i }));
    await user.type(screen.getByLabelText("Código"), "LT");
    await user.type(screen.getByLabelText("Nombre"), "Litro");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));
    await screen.findByText("Litro");
    unmount();

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    const selectUnidad = await screen.findByLabelText("Unidad de medida");
    expect(within(selectUnidad).getByRole("option", { name: "Litro" })).toBeInTheDocument();
  });

  /**
   * Lo que NO cambia (mismo criterio que hoy, `unidad-medida-list.tsx`): dar
   * de baja no elimina la unidad (RESTRICT en el FK de `insumos`), así que el
   * alta de insumo la sigue listando para no dejar sin opción a un insumo que
   * YA apunta a ella — pero marcada, no como una opción más.
   *
   * OJO CON EL ALCANCE: este test NO ejercita la acción de desactivar. Sirve
   * una unidad que YA viene con `activo: false` y verifica cómo se RENDERIZA.
   * El nombre dice eso y no otra cosa a propósito: la desactivación por el
   * ABM no está cubierta acá ni en ningún otro spec, y tampoco lo estaba
   * antes de mover la pantalla. Queda como hueco registrado, no tapado por un
   * título que promete más de lo que prueba.
   */
  it("una unidad dada de baja aparece marcada (deshabilitada) en el desplegable del alta, no se elimina", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/unidades-medida", () => HttpResponse.json([{ ...UNIDAD_UN, activo: false }])),
      http.get("/api/familias-insumo", () => HttpResponse.json([])),
    );

    renderWithProviders(<InsumoFormDialog trigger={<button>Nuevo insumo</button>} />);
    await user.click(screen.getByRole("button", { name: "Nuevo insumo" }));

    const selectUnidad = await screen.findByLabelText("Unidad de medida");
    expect(within(selectUnidad).getByRole("option", { name: "Unidad (deshabilitada)" })).toBeInTheDocument();
  });
});
