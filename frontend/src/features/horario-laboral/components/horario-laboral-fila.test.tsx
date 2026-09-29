import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HorarioLaboralFila } from "./horario-laboral-fila";

/**
 * HorarioLaboralFila — componente presentacional puro (sdd/horario-laboral-por-cliente,
 * WU-8a): sin hooks propios, sin red. Se prueba con props directas y callbacks espía.
 */
describe("HorarioLaboralFila", () => {
  it("un día abierto muestra la checkbox marcada y los dos horarios habilitados", () => {
    render(
      <HorarioLaboralFila
        nombreDia="Lunes"
        abierto={true}
        apertura="09:00"
        cierre="18:00"
        soloLectura={false}
        onCambiarAbierto={vi.fn()}
        onCambiarApertura={vi.fn()}
        onCambiarCierre={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Lunes" })).toBeChecked();
    expect(screen.getByLabelText("Apertura")).toHaveValue("09:00");
    expect(screen.getByLabelText("Apertura")).not.toBeDisabled();
    expect(screen.getByLabelText(/cierre/i)).toHaveValue("18:00");
  });

  it("un día cerrado deshabilita los dos horarios, aunque no sea solo lectura", () => {
    render(
      <HorarioLaboralFila
        nombreDia="Domingo"
        abierto={false}
        apertura=""
        cierre=""
        soloLectura={false}
        onCambiarAbierto={vi.fn()}
        onCambiarApertura={vi.fn()}
        onCambiarCierre={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Domingo" })).not.toBeChecked();
    expect(screen.getByLabelText("Apertura")).toBeDisabled();
    expect(screen.getByLabelText(/cierre/i)).toBeDisabled();
  });

  it("solo lectura deshabilita la checkbox y los dos horarios de un día abierto", () => {
    render(
      <HorarioLaboralFila
        nombreDia="Martes"
        abierto={true}
        apertura="09:00"
        cierre="18:00"
        soloLectura={true}
        onCambiarAbierto={vi.fn()}
        onCambiarApertura={vi.fn()}
        onCambiarCierre={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Martes" })).toBeDisabled();
    expect(screen.getByLabelText("Apertura")).toBeDisabled();
    expect(screen.getByLabelText(/cierre/i)).toBeDisabled();
  });

  it("tocar la checkbox y los horarios dispara los callbacks con el valor nuevo", async () => {
    const user = userEvent.setup();
    const onCambiarAbierto = vi.fn();
    const onCambiarApertura = vi.fn();

    render(
      <HorarioLaboralFila
        nombreDia="Miércoles"
        abierto={true}
        apertura="09:00"
        cierre="18:00"
        soloLectura={false}
        onCambiarAbierto={onCambiarAbierto}
        onCambiarApertura={onCambiarApertura}
        onCambiarCierre={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Miércoles" }));
    expect(onCambiarAbierto).toHaveBeenCalledWith(false);

    await user.type(screen.getByLabelText("Apertura"), "10:00");
    expect(onCambiarApertura).toHaveBeenCalled();
  });

  it("muestra los mensajes de error de apertura y cierre con role=alert", () => {
    render(
      <HorarioLaboralFila
        nombreDia="Jueves"
        abierto={true}
        apertura="18:00"
        cierre="09:00"
        soloLectura={false}
        errorApertura="La apertura es obligatoria."
        errorCierre="La apertura debe ser anterior al cierre."
        onCambiarAbierto={vi.fn()}
        onCambiarApertura={vi.fn()}
        onCambiarCierre={vi.fn()}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent("La apertura es obligatoria.");
    expect(alerts[1]).toHaveTextContent("La apertura debe ser anterior al cierre.");
  });
});
