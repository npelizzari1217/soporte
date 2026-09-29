import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ComponenteEditDialog } from "./componente-edit-dialog";
import type { ComponenteConTipo } from "../types";

const EQUIPO_ID = "66666666-6666-6666-6666-666666666666";

const COMPONENTE: ComponenteConTipo = {
  id: "c1",
  equipoId: EQUIPO_ID,
  insumoId: "11111111-1111-4111-8111-111111111111",
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

describe("ComponenteEditDialog", () => {
  it("precarga descripción/número de serie/capacidad , muestra el tipo de solo lectura y guarda vía PATCH", async () => {
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
    expect(screen.getByTestId("editar-componente-tipo")).toHaveTextContent("Memoria RAM");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/descripción/i));
    await user.type(screen.getByLabelText(/descripción/i), "Slot 1 actualizado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedBody.descripcion).toBe("Slot 1 actualizado"));
    expect(capturedBody).toMatchObject({ numeroSerie: "SN-001", capacidad: "16GB" });
    // El tipo y el repuesto son inmutables: el PATCH no los envía.
    expect(capturedBody).not.toHaveProperty("tipoComponenteCodigo");
    expect(capturedBody).not.toHaveProperty("insumoId");

    // Cierra el dialog al guardar.
    await waitFor(() => expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument());
  });

  it("sin nombre de tipo muestra '—' como texto de solo lectura", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponenteEditDialog equipoId={EQUIPO_ID} componente={{ ...COMPONENTE, tipoNombre: null }} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByTestId("editar-componente-tipo")).toHaveTextContent("—");
  });

  it("un tipo de familia dada de baja se sigue mostrando por su nombre", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComponenteEditDialog
        equipoId={EQUIPO_ID}
        componente={{ ...COMPONENTE, tipoNombre: "Teclado mecánico", tipoActivo: false }}
      />,
      { user: buildUser({ permisos: ["equipo:gestionar"] }) },
    );

    await user.click(screen.getByLabelText(/editar componente/i));

    expect(await screen.findByTestId("editar-componente-tipo")).toHaveTextContent("Teclado mecánico");
  });
});
