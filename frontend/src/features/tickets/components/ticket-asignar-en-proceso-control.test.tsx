import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketAsignarEnProcesoControl } from "./ticket-asignar-en-proceso-control";
import type { TecnicoAsignable } from "../types";

const TECNICOS: TecnicoAsignable[] = [
  { id: "tec-1", nombre: "Ana", apellido: "García" },
  { id: "tec-2", nombre: "Beto", apellido: "López" },
];

describe("TicketAsignarEnProcesoControl", () => {
  it("sin ticket:asignar → no renderiza el control", () => {
    renderWithProviders(
      <TicketAsignarEnProcesoControl tecnicos={TECNICOS} onAsignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: [] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("con ticket:asignar pero sin ticket:transicionar → no renderiza el control", () => {
    // El endpoint exige AMBOS permisos; el gate debe espejar ese AND.
    renderWithProviders(
      <TicketAsignarEnProcesoControl tecnicos={TECNICOS} onAsignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:asignar"] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("con permiso → el combo lista los técnicos elegibles recibidos", () => {
    renderWithProviders(
      <TicketAsignarEnProcesoControl tecnicos={TECNICOS} onAsignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:asignar", "ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Elegí un técnico", "Ana García", "Beto López"]);
  });

  it("elegir un técnico y confirmar → llama onAsignar con el asignadoId elegido", async () => {
    const user = userEvent.setup();
    const onAsignar = vi.fn();
    renderWithProviders(
      <TicketAsignarEnProcesoControl tecnicos={TECNICOS} onAsignar={onAsignar} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:asignar", "ticket:transicionar"] }) },
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /asignar técnico/i }), "tec-2");
    await user.click(screen.getByRole("button", { name: /asignar y poner en proceso/i }));

    expect(onAsignar).toHaveBeenCalledWith("tec-2");
  });

  it("sin técnico elegido → el botón queda deshabilitado (no dispara la mutación)", () => {
    renderWithProviders(
      <TicketAsignarEnProcesoControl tecnicos={TECNICOS} onAsignar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:asignar", "ticket:transicionar"] }) },
    );
    expect(screen.getByRole("button", { name: /asignar y poner en proceso/i })).toBeDisabled();
  });
});
