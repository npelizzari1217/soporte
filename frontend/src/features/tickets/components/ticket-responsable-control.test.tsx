import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketResponsableControl, type ModoResponsable } from "./ticket-responsable-control";
import type { TecnicoAsignable } from "../types";

const TECNICOS: TecnicoAsignable[] = [
  { id: "tec-1", nombre: "Ana", apellido: "García" },
  { id: "tec-2", nombre: "Beto", apellido: "López" },
];

function render(modo: ModoResponsable, permisos: string[], handlers = { arranque: vi.fn(), cambio: vi.fn() }) {
  renderWithProviders(
    <TicketResponsableControl
      tecnicos={TECNICOS}
      modo={modo}
      onAsignarEnProceso={handlers.arranque}
      onReasignar={handlers.cambio}
      isSubmitting={false}
    />,
    { user: buildUser({ permisos }) },
  );
  return handlers;
}

describe("TicketResponsableControl", () => {
  it("sin TICKETS:ASIGNAR no renderiza nada, en ningún modo", () => {
    render("arranque", ["TICKETS:TRANSICIONAR"]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("el desplegable lleva la etiqueta visible «Nuevo responsable» y lista los candidatos recibidos", () => {
    render("cambio", ["TICKETS:ASIGNAR"]);
    const combo = screen.getByRole("combobox", { name: /nuevo responsable/i });
    expect(screen.getByText("Nuevo responsable")).toBeInTheDocument();
    expect(combo).toHaveTextContent("Ana García");
    expect(combo).toHaveTextContent("Beto López");
  });

  it("arranque con ASIGNAR y TRANSICIONAR → un solo botón «Asignar y poner en proceso» que llama onAsignarEnProceso", async () => {
    const user = userEvent.setup();
    const handlers = render("arranque", ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"]);

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cambiar responsable/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo responsable/i }), "tec-2");
    await user.click(screen.getByRole("button", { name: /asignar y poner en proceso/i }));

    expect(handlers.arranque).toHaveBeenCalledWith("tec-2");
    expect(handlers.cambio).not.toHaveBeenCalled();
  });

  it("arranque con ASIGNAR pero sin TRANSICIONAR → cae a «Cambiar responsable» (lo que ya podía hacer)", async () => {
    const user = userEvent.setup();
    const handlers = render("arranque", ["TICKETS:ASIGNAR"]);

    expect(screen.queryByRole("button", { name: /asignar y poner en proceso/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo responsable/i }), "tec-1");
    await user.click(screen.getByRole("button", { name: /cambiar responsable/i }));

    expect(handlers.cambio).toHaveBeenCalledWith("tec-1");
    expect(handlers.arranque).not.toHaveBeenCalled();
  });

  it("cambio → «Cambiar responsable» llama onReasignar y no toca el arranque", async () => {
    const user = userEvent.setup();
    const handlers = render("cambio", ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"]);

    expect(screen.queryByRole("button", { name: /asignar y poner en proceso/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: /nuevo responsable/i }), "tec-2");
    await user.click(screen.getByRole("button", { name: /cambiar responsable/i }));

    expect(handlers.cambio).toHaveBeenCalledWith("tec-2");
    expect(handlers.arranque).not.toHaveBeenCalled();
  });

  it("sin elección el botón queda deshabilitado", () => {
    render("arranque", ["TICKETS:ASIGNAR", "TICKETS:TRANSICIONAR"]);
    expect(screen.getByRole("button", { name: /asignar y poner en proceso/i })).toBeDisabled();
  });
});
