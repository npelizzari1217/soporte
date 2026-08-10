import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { TicketTransitionControl } from "./ticket-transition-control";

describe("TicketTransitionControl", () => {
  it("sin ticket:transicionar → no renderiza el control (USUARIO/COLABORADOR no pueden ni intentarlo)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="NUEVO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "USUARIO", permisos: [] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("TECNICO, estado NUEVO → el arco de arranque (ASIGNADO) lo cubre el control unificado; manual ofrece SOLO [CANCELADO]", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="NUEVO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Cancelado"]);
  });

  it("TECNICO, estado ASIGNADO → el arco EN_PROCESO lo cubre el control unificado; manual ofrece SOLO [CANCELADO]", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="ASIGNADO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Cancelado"]);
  });

  it("TECNICO, estado EN_PROCESO → ofrece EXACTAMENTE [RESUELTO, CANCELADO] (flujo posterior, sin cambios)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Resuelto", "Cancelado"]);
  });

  it("TECNICO, estado terminal (CERRADO, sin reapertura) → NO ofrece ningún select, muestra mensaje de estado final", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="CERRADO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/sin transiciones disponibles/i)).toBeInTheDocument();
  });

  it("TECNICO: elegir un destino válido y confirmar → llama onTransicionar con ese código", async () => {
    const user = userEvent.setup();
    const onTransicionar = vi.fn();
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={onTransicionar} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );

    await user.selectOptions(screen.getByRole("combobox"), "RESUELTO");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(onTransicionar).toHaveBeenCalledWith("RESUELTO");
  });
});

describe("TicketTransitionControl — salto correctivo (ROOT/ADMINISTRADOR)", () => {
  it("ADMINISTRADOR, estado EN_PROCESO → ofrece la sección 'Corregir estado' con los no terminales (menos el actual)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "ADMINISTRADOR", permisos: ["ticket:transicionar"] }) },
    );
    const correctivo = screen.getByRole("combobox", { name: /corregir estado/i });
    const opciones = within(correctivo)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Nuevo", "Asignado", "Resuelto"]);
  });

  it("ROOT, estado terminal CERRADO → puede reabrir vía 'Corregir estado' (todos los no terminales)", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="CERRADO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: null, is_global_admin: true, permisos: [] }) },
    );
    const correctivo = screen.getByRole("combobox", { name: /corregir estado/i });
    const opciones = within(correctivo)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Nuevo", "Asignado", "En proceso", "Resuelto"]);
  });

  it("corrector: elegir un destino correctivo y confirmar → llama onTransicionar con ese código", async () => {
    const user = userEvent.setup();
    const onTransicionar = vi.fn();
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={onTransicionar} isSubmitting={false} />,
      { user: buildUser({ rol: "ADMINISTRADOR", permisos: ["ticket:transicionar"] }) },
    );

    const correctivo = screen.getByRole("combobox", { name: /corregir estado/i });
    await user.selectOptions(correctivo, "ASIGNADO");
    await user.click(screen.getByRole("button", { name: /corregir/i }));

    expect(onTransicionar).toHaveBeenCalledWith("ASIGNADO");
  });

  it("no-corrector (TECNICO) NO ve la sección 'Corregir estado'", () => {
    renderWithProviders(
      <TicketTransitionControl estadoActualCodigo="EN_PROCESO" onTransicionar={vi.fn()} isSubmitting={false} />,
      { user: buildUser({ rol: "TECNICO", permisos: ["ticket:transicionar"] }) },
    );
    expect(screen.queryByRole("combobox", { name: /corregir estado/i })).not.toBeInTheDocument();
  });
});
