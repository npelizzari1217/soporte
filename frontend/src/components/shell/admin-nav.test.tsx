import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AdminNav } from "./admin-nav";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/admin/usuarios") }));

function renderWithUser(user: JwtPayload | null) {
  return render(
    <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
      <AdminNav />
    </SessionContext.Provider>,
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
    membresias: [],
    modulos: [],
    nombre: "Juan",
    apellido: "Pérez",
    ...overrides,
  };
}

// ADR-P5: las 5 secciones son ADMINISTRADOR-o-ROOT exclusivas — un TECNICO
// no ve NINGÚN link de gestión, aunque las lecturas de catálogos sigan abiertas.
describe("AdminNav (ADR-P5)", () => {
  it("ADMINISTRADOR ve las 5 secciones", () => {
    renderWithUser(payload({ rol: "ADMINISTRADOR" }));
    expect(screen.getByRole("link", { name: "Catálogos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ciclos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Insumos" })).toBeInTheDocument();
    // Issue #156: "Unidades" salió de adentro de Admin > Insumos y pasó a
    // tener entrada propia, con el MISMO gate (esAdminCliente).
    expect(screen.getByRole("link", { name: "Unidades" })).toBeInTheDocument();
  });

  it("TECNICO (no admin, no root) no ve ninguna sección", () => {
    renderWithUser(payload({ rol: "TECNICO" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

});
