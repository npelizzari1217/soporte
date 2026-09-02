import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SoloRoot } from "./solo-root";
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

// Es el gate MÁS restrictivo de los tres: ni una celda de la matriz ni el rol
// ADMINISTRADOR del cliente alcanzan. Los dos casos negativos están acá
// justamente porque son los que se confunden con `<Can>` y `<SoloAdminCliente>`.
describe("SoloRoot", () => {
  it("ROOT (is_global_admin) → renderiza children", () => {
    renderWithUser(
      <SoloRoot>
        <button>Nuevo artículo</button>
      </SoloRoot>,
      payload({ is_global_admin: true }),
    );
    expect(screen.getByRole("button", { name: "Nuevo artículo" })).toBeInTheDocument();
  });

  it.each([
    ["ADMINISTRADOR del cliente", payload({ rol: "ADMINISTRADOR" })],
    ["actor con la celda KB:ALTAS en la matriz", payload({ permisos: ["KB:ALTAS"] })],
    ["sin sesión", null],
  ])("%s → NO renderiza children", (_caso, user) => {
    renderWithUser(
      <SoloRoot>
        <button>Nuevo artículo</button>
      </SoloRoot>,
      user,
    );
    expect(screen.queryByRole("button", { name: "Nuevo artículo" })).not.toBeInTheDocument();
  });

  it("no-ROOT + fallback provisto → renderiza el fallback", () => {
    renderWithUser(
      <SoloRoot fallback={<span>Solo el administrador global</span>}>
        <button>Nuevo artículo</button>
      </SoloRoot>,
      payload({ rol: "ADMINISTRADOR" }),
    );
    expect(screen.getByText("Solo el administrador global")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo artículo" })).not.toBeInTheDocument();
  });
});
