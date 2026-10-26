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

  it("datos nuevos del servidor no pisan lo que el usuario está editando (JD-A-005)", async () => {
    const user = userEvent.setup();
    const props = { soloLectura: false, guardando: false, onGuardar: vi.fn() };
    const { rerender } = render(<HorarioLaboralForm valoresIniciales={DEFAULT} {...props} />);

    // El usuario cierra el lunes y, sin guardar, llega un refetch con el martes de 10 a 18.
    await user.click(screen.getByRole("checkbox", { name: "Lunes" }));
    const refetch: HorarioLaboral = {
      dias: DEFAULT.dias.map((dia) => (dia.diaSemana === 2 ? { ...dia, aperturaMinuto: 600 } : dia)),
    };
    rerender(<HorarioLaboralForm valoresIniciales={refetch} {...props} />);

    expect(screen.getByRole("checkbox", { name: "Lunes" })).not.toBeChecked();
    expect(screen.getAllByLabelText("Apertura")[2]).toHaveValue("10:00");
  });

  it("después de guardar, datos nuevos del servidor reemplazan también los días editados", async () => {
    // Caso: guardar el horario propio y después "Volver al horario del cliente". El form no se
    // vuelve a montar, así que lo editado y ya guardado no puede quedar pegado en la grilla.
    const user = userEvent.setup();
    const props = { soloLectura: false, guardando: false, onGuardar: vi.fn() };
    const { rerender } = render(<HorarioLaboralForm valoresIniciales={DEFAULT} {...props} />);
    await user.click(screen.getByRole("checkbox", { name: "Lunes" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(props.onGuardar).toHaveBeenCalledTimes(1));
    const guardado: HorarioLaboral = {
      dias: DEFAULT.dias.map((dia) =>
        dia.diaSemana === 1 ? { ...dia, aperturaMinuto: null, cierreMinuto: null } : dia,
      ),
    };
    rerender(<HorarioLaboralForm valoresIniciales={guardado} {...props} />);
    rerender(<HorarioLaboralForm valoresIniciales={DEFAULT} {...props} />);

    expect(screen.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
  });

  it("sin edición en curso, datos nuevos del servidor reemplazan la grilla", () => {
    const props = { soloLectura: false, guardando: false, onGuardar: vi.fn() };
    const { rerender } = render(<HorarioLaboralForm valoresIniciales={DEFAULT} {...props} />);

    const refetch: HorarioLaboral = {
      dias: DEFAULT.dias.map((dia) => (dia.diaSemana === 1 ? { ...dia, aperturaMinuto: 600 } : dia)),
    };
    rerender(<HorarioLaboralForm valoresIniciales={refetch} {...props} />);

    expect(screen.getAllByLabelText("Apertura")[1]).toHaveValue("10:00");
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
