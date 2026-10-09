import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketReasignarControl } from "./ticket-reasignar-control";
import type { TecnicoAsignable } from "../types";

const TECNICOS: TecnicoAsignable[] = [
  { id: "tec-1", nombre: "Ana", apellido: "García" },
  { id: "tec-2", nombre: "Beto", apellido: "López" },
];

describe("TicketReasignarControl", () => {
  it("sin TICKETS:ASIGNAR → no se muestra", () => {
    renderWithProviders(
      <TicketReasignarControl tecnicos={TECNICOS} onReasignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: [] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("con TICKETS:ASIGNAR (sin TRANSICIONAR) → lista los candidatos recibidos", () => {
    renderWithProviders(
      <TicketReasignarControl tecnicos={TECNICOS} onReasignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["TICKETS:ASIGNAR"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Elegí otro responsable", "Ana García", "Beto López"]);
  });

  it("elegir y confirmar → llama onReasignar con el id elegido", async () => {
    const user = userEvent.setup();
    const onReasignar = vi.fn();
    renderWithProviders(
      <TicketReasignarControl tecnicos={TECNICOS} onReasignar={onReasignar} isSubmitting={false} />,
      { user: buildUser({ permisos: ["TICKETS:ASIGNAR"] }) },
    );
    await user.selectOptions(screen.getByRole("combobox", { name: /cambiar responsable/i }), "tec-2");
    await user.click(screen.getByRole("button", { name: /^reasignar$/i }));
    expect(onReasignar).toHaveBeenCalledWith("tec-2");
  });

  it("sin elección → el botón queda deshabilitado", () => {
    renderWithProviders(
      <TicketReasignarControl tecnicos={TECNICOS} onReasignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["TICKETS:ASIGNAR"] }) },
    );
    expect(screen.getByRole("button", { name: /^reasignar$/i })).toBeDisabled();
  });
});
