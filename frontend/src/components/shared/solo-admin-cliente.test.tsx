import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SoloAdminCliente } from "./solo-admin-cliente";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

function renderWithUser(ui: React.ReactElement, user: JwtPayload | null) {
  return render(
    <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>{ui}</SessionContext.Provider>,
  );
}

function payload(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: "1",
    cliente_id: "c1",
    rol: "TECNICO",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Cliente Uno",
    zona_horaria: "Europe/Madrid",
    membresias: [],
    modulos: [],
    nombre: "Juan",
    apellido: "Pérez",
    ...overrides,
  };
}

// ADR-P5 (sdd/matriz-permisos-por-usuario): <Can permiso=...> no puede
// expresar "admin o root" — necesita este componente hermano.
describe("SoloAdminCliente", () => {
  it("ADMINISTRADOR → renders children", () => {
    renderWithUser(
      <SoloAdminCliente>
        <button>Gestionar</button>
      </SoloAdminCliente>,
      payload({ rol: "ADMINISTRADOR" }),
    );
    expect(screen.getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
  });

  it("ROOT (is_global_admin) → renders children aunque rol no sea ADMINISTRADOR", () => {
    renderWithUser(
      <SoloAdminCliente>
        <button>Gestionar</button>
      </SoloAdminCliente>,
      payload({ rol: "TECNICO", is_global_admin: true }),
    );
    expect(screen.getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
  });

  it("TECNICO (no admin, no root) → does NOT render children (gated out)", () => {
    renderWithUser(
      <SoloAdminCliente>
        <button>Gestionar</button>
      </SoloAdminCliente>,
      payload({ rol: "TECNICO" }),
    );
    expect(screen.queryByRole("button", { name: "Gestionar" })).not.toBeInTheDocument();
  });

  it("TECNICO + fallback provisto → renders the fallback instead", () => {
    renderWithUser(
      <SoloAdminCliente fallback={<span>Sin permiso</span>}>
        <button>Gestionar</button>
      </SoloAdminCliente>,
      payload({ rol: "TECNICO" }),
    );
    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar" })).not.toBeInTheDocument();
  });
});
