import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketTransitionControl } from "./ticket-transition-control";

describe("TicketTransitionControl", () => {
  it("sin ticket:transicionar → no renderiza el control (USUARIO/COLABORADOR no pueden ni intentarlo)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="NUEVO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: [] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("estado NUEVO → el arco de arranque (ASIGNADO) lo cubre el control unificado; manual ofrece SOLO [CANCELADO]", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="NUEVO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Cancelado"]);
  });

  it("estado ASIGNADO → el arco EN_PROCESO lo cubre el control unificado; manual ofrece SOLO [CANCELADO]", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="ASIGNADO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Cancelado"]);
  });

  it("con permiso, estado EN_PROCESO → ofrece EXACTAMENTE [RESUELTO, CANCELADO] (flujo posterior, sin cambios)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Resuelto", "Cancelado"]);
  });

  it("estado terminal (CERRADO, sin reapertura) → NO ofrece ningún select, muestra mensaje de estado final", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="CERRADO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:transicionar"] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/sin transiciones disponibles/i)).toBeInTheDocument();
  });

  it("elegir un destino válido y confirmar → llama onTransicionar con ese código", async () => {
    const user = userEvent.setup();
    const onTransicionar = vi.fn();
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={onTransicionar} isSubmitting={false} />,
      { user: buildUser({ permisos: ["ticket:transicionar"] }) },
    );

    await user.selectOptions(screen.getByRole("combobox"), "RESUELTO");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(onTransicionar).toHaveBeenCalledWith("RESUELTO");
  });
});
