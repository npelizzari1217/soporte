import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EquipoEditDialog } from "./equipo-edit-dialog";
import type { EquipoDetalle } from "../types";

const EQUIPO_ID = "44444444-4444-4444-4444-444444444444";

const EQUIPO: EquipoDetalle = {
  id: EQUIPO_ID,
  nombre: "Notebook Dell",
  numeroSerie: "SN-001",
  marca: "Dell",
  modelo: "Latitude",
  fechaAdquisicion: null,
  ubicacion: "OFICINA 1",
  importe: 1000,
  fechaValoracion: null,
  observaciones: null,
  valorResidual: null,
  fechaValorResidual: null,
  activo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  componentes: [],
};

describe("EquipoEditDialog", () => {
  beforeEach(() => {
    server.use(http.patch(`/api/equipos/${EQUIPO_ID}`, () => HttpResponse.json({ ...EQUIPO, nombre: "Editado" })));
  });

  it("el form abre en un MODAL (no inline) y pre-pobla los valores actuales", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    // Sin abrir, el form no está en el DOM (es popup, no inline).
    expect(screen.queryByText("Editar equipo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(await screen.findByText("Editar equipo")).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Notebook Dell");
    expect(screen.getByLabelText(/importe/i)).toHaveValue(1000);
  });

  it("guardar dispara el PATCH y cierra el modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(screen.queryByText("Editar equipo")).not.toBeInTheDocument());
  });
});
