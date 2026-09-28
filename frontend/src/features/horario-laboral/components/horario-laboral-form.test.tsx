import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HorarioLaboralForm } from "./horario-laboral-form";
import type { HorarioLaboral } from "../types";

/**
 * HorarioLaboralForm — grilla presentacional de 7 filas (sdd/horario-laboral-por-cliente,
 * WU-8a). Sin red: `onGuardar` recibe el DTO ya convertido, espiado con `vi.fn()`.
 */
const DEFAULT: HorarioLaboral = {
  dias: [
    { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
    { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
    { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
  ],
};

describe("HorarioLaboralForm", () => {
  it("admin (soloLectura=false) puede editar y guardar", async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(
      <HorarioLaboralForm
        valoresIniciales={DEFAULT}
        soloLectura={false}
        guardando={false}
        onGuardar={onGuardar}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Lunes" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    expect(onGuardar).toHaveBeenCalledWith(DEFAULT);
  });

  it("no-admin (soloLectura=true) ve la grilla deshabilitada y sin botón Guardar", () => {
    render(
      <HorarioLaboralForm
        valoresIniciales={DEFAULT}
        soloLectura={true}
        guardando={false}
        onGuardar={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Lunes" })).toBeDisabled();
    // índice 1 = Lunes (0 = Domingo, D14: orden `diaSemana` 0..6)
    expect(screen.getAllByLabelText("Apertura")[1]).toBeDisabled();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });

  it("marcar los 7 días cerrados muestra el mensaje de la raíz del schema y no llama a onGuardar", async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();
    render(
      <HorarioLaboralForm
        valoresIniciales={DEFAULT}
        soloLectura={false}
        guardando={false}
        onGuardar={onGuardar}
      />,
    );

    for (const nombreDia of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]) {
      await user.click(screen.getByRole("checkbox", { name: nombreDia }));
    }
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText("Debe quedar al menos un día abierto.")).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor pasado por props sin desmontar el form", () => {
    render(
      <HorarioLaboralForm
        valoresIniciales={DEFAULT}
        soloLectura={false}
        guardando={false}
        errorServidor="No se pudo guardar el horario."
        onGuardar={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar el horario.");
    expect(screen.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
  });

  it("guardando=true deshabilita el botón Guardar", () => {
    render(
      <HorarioLaboralForm
        valoresIniciales={DEFAULT}
        soloLectura={false}
        guardando={true}
        onGuardar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
  });
});
