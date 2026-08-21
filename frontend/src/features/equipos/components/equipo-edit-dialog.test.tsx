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

/** Registra el handler de edición y devuelve el body que efectivamente viajó. */
function capturarPatch(): { body: Record<string, unknown> } {
  const capturado: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.patch(`/api/equipos/${EQUIPO_ID}`, async ({ request }) => {
      capturado.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...EQUIPO, nombre: "Editado" });
    }),
  );
  return capturado;
}

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
    // El importe se LEE formateado; el valor del form sigue siendo el crudo.
    expect(screen.getByLabelText(/importe/i)).toHaveValue("1.000,00");
  });

  // render-fechas-frontend: `Equipo.fechaAdquisicion`/`fechaValoracion`/
  // `fechaValorResidual` pre-pueblan `<input type="date">` vía `aFechaInput`
  // (antes `.slice(0, 10)` open-coded en este mismo archivo) — deduplicación,
  // no cambio de comportamiento: sigue aceptando el ISO completo del backend.
  it("las tres fechas pre-pueblan el input date en YYYY-MM-DD a partir del ISO completo del backend", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipoEditDialog
        equipo={{
          ...EQUIPO,
          fechaAdquisicion: "2026-08-17T00:00:00.000Z",
          fechaValoracion: "2026-08-18T00:00:00.000Z",
          fechaValorResidual: "2026-08-19T00:00:00.000Z",
        }}
      />,
      { user: buildUser({ permisos: ["equipo:gestionar"] }) },
    );

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    expect(screen.getByLabelText(/fecha de adquisición/i)).toHaveValue("2026-08-17");
    expect(screen.getByLabelText(/fecha de valoración/i)).toHaveValue("2026-08-18");
    expect(screen.getByLabelText(/fecha del valor residual/i)).toHaveValue("2026-08-19");
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

  /**
   * El importe y el valor residual se MUESTRAN formateados al salir del campo,
   * pero lo que viaja tiene que seguir siendo el número crudo: si la cadena
   * formateada llegara al payload, `parseImporte` la convertiría en `null` y
   * el equipo perdería su valuación.
   */
  it("tras el blur el PATCH lleva el número CRUDO, no la cadena formateada", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/importe/i);
    await user.clear(importe);
    await user.type(importe, "1234567.89");
    await user.tab();

    expect(importe).toHaveValue("1.234.567,89");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.importe).toBe(1234567.89));
    expect(capturado.body.nombre).toBe("Notebook Dell");
  });

  it("volver a enfocar devuelve el valor editable, sin puntos de miles que borrar a mano", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    const importe = screen.getByLabelText(/importe/i);
    await user.click(importe);

    expect(importe).toHaveValue("1000");
  });

  /**
   * `aplicarDepreciacion` escribe el residual derivado en el formulario: tiene
   * que seguir escribiendo el CRUDO. Si escribiera `"700,00"`, el PATCH
   * mandaría `null` en vez de `700`.
   */
  it("aplicar depreciación y guardar produce el mismo payload de siempre", async () => {
    const capturado = capturarPatch();
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    await screen.findByText("Editar equipo");

    await user.type(screen.getByLabelText(/% de depreciación/i), "30");
    await user.click(screen.getByRole("button", { name: /^aplicar$/i }));

    expect(screen.getByLabelText(/^valor residual$/i)).toHaveValue("700,00");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturado.body.valorResidual).toBe(700));
    expect(capturado.body.importe).toBe(1000);
  });

  it("la base de depreciación se muestra formateada, igual que los campos de al lado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipoEditDialog equipo={EQUIPO} />, {
      user: buildUser({ permisos: ["equipo:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /^editar$/i }));

    expect(await screen.findByText(/se deprecia sobre el importe: \$1\.000,00/i)).toBeInTheDocument();
  });
});
