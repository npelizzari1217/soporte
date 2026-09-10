import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteEditDialog } from "./componente-edit-dialog";
import type { ComponenteConTipo } from "../types";

const EQUIPO_ID = "66666666-6666-6666-6666-666666666666";

const TIPOS_ACTIVOS = [
  { codigo: "RAM", nombre: "Memoria RAM" },
  { codigo: "DISCO", nombre: "Disco rígido" },
];

const COMPONENTE: ComponenteConTipo = {
  id: "c1",
  equipoId: EQUIPO_ID,
  tipoComponenteCodigo: "RAM",
  insumoId: null,
  tipoNombre: "Memoria RAM",
  tipoActivo: true,
  descripcion: "Slot 1",
  numeroSerie: "SN-001",
  capacidad: "16GB",
  activo: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function mockBackend() {
  server.use(http.get("/api/equipos/tipos-componente", () => HttpResponse.json(TIPOS_ACTIVOS)));
}

describe("ComponenteEditDialog", () => {
  beforeEach(() => mockBackend());

  it("precarga tipo/descripción/número de serie/capacidad y guarda vía PATCH", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/equipos/${EQUIPO_ID}/componentes/c1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...COMPONENTE, descripcion: "Slot 1 actualizado" });
      }),
    );

    renderWithProviders(<ComponenteEditDialog equipoId={EQUIPO_ID} componente={COMPONENTE} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByLabelText(/descripción/i)).toHaveValue("Slot 1");
    expect(screen.getByLabelText(/número de serie/i)).toHaveValue("SN-001");
    expect(screen.getByLabelText(/capacidad/i)).toHaveValue("16GB");
    expect(screen.getByLabelText(/tipo/i)).toHaveValue("RAM");

    await user.clear(screen.getByLabelText(/descripción/i));
    await user.type(screen.getByLabelText(/descripción/i), "Slot 1 actualizado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Slot 1 actualizado"));
    expect(capturedBody).toMatchObject({
      tipoComponenteCodigo: "RAM",
      numeroSerie: "SN-001",
      capacidad: "16GB",
    });

    // Cierra el dialog al guardar.
    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  /**
   * Hallazgo de revisión automática: el backend deriva `tipoComponenteCodigo`
   * de la familia del repuesto vinculado y rechaza cualquier PATCH que
   * intente cambiarlo (`ComponenteVinculadoTipoInmutableError`). Ofrecer acá
   * un select editable sería deshonesto, aunque el backend ya no rechace el
   * no-op — y el submit tiene que seguir mandando el campo (con el mismo
   * valor), no omitirlo: `EditarComponenteUseCase` lo exige presente.
   */
  it("deshabilita el select de tipo en un componente VINCULADO a un repuesto y envía el MISMO tipoComponenteCodigo", async () => {
    const componenteVinculado: ComponenteConTipo = {
      ...COMPONENTE,
      insumoId: "11111111-1111-4111-8111-111111111111",
    };

    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch(`/api/equipos/${EQUIPO_ID}/componentes/c1`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...componenteVinculado, descripcion: "Slot 1 actualizado" });
      }),
    );

    renderWithProviders(<ComponenteEditDialog equipoId={EQUIPO_ID} componente={componenteVinculado} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByLabelText(/^tipo$/i)).toBeDisabled();
    expect(screen.getByText(/lo determina el repuesto vinculado/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/descripción/i));
    await user.type(screen.getByLabelText(/descripción/i), "Slot 1 actualizado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Slot 1 actualizado"));
    expect(capturedBody.tipoComponenteCodigo).toBe("RAM");
  });

  /**
   * Gemelo invertido del caso de arriba, y no es redundante: sin él,
   * `disabled={componente.insumoId != null}` podría reemplazarse por un
   * `disabled` fijo y toda la suite seguiría verde. Los otros casos de este
   * archivo solo LEEN el select —`toHaveValue`, `findByRole("option")`—, y
   * eso funciona igual sobre un control deshabilitado; el payload que se
   * envía sale de los valores del formulario, no del DOM.
   *
   * En `ComponenteCreateDialog` este gemelo no hace falta porque sus otros
   * casos hacen `selectOptions` sobre ese control, y `userEvent` lanza si
   * está deshabilitado. Acá nunca se selecciona: por eso el guard necesita
   * su propio caso.
   */
  it("un componente SIN repuesto vinculado deja el tipo editable y sin la nota", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponenteEditDialog equipoId={EQUIPO_ID} componente={COMPONENTE} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByLabelText(/^tipo$/i)).not.toBeDisabled();
    expect(screen.queryByText(/lo determina el repuesto vinculado/i)).not.toBeInTheDocument();
  });

  it("incluye el tipo actual del componente como opción aunque esté inactivo en el catálogo", async () => {
    const componenteTipoInactivo: ComponenteConTipo = {
      ...COMPONENTE,
      tipoComponenteCodigo: "TECLADO",
      tipoNombre: "Teclado mecánico",
      tipoActivo: false,
    };

    const user = userEvent.setup();
    renderWithProviders(<ComponenteEditDialog equipoId={EQUIPO_ID} componente={componenteTipoInactivo} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByRole("option", { name: /teclado mecánico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tipo/i)).toHaveValue("TECLADO");
  });
});
