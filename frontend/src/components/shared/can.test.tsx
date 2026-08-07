import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Can } from "./can";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

function renderWithUser(ui: React.ReactElement, user: JwtPayload | null) {
  return render(
    <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>{ui}</SessionContext.Provider>,
  );
}

const userWithAsignar: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "TECNICO",
  permisos: ["ticket:asignar"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [],
  modulos: [],
};

describe("Can", () => {
  it("permiso present → renders children", () => {
    renderWithUser(
      <Can permiso="ticket:asignar">
        <button>Asignar</button>
      </Can>,
      userWithAsignar,
    );
    expect(screen.getByRole("button", { name: "Asignar" })).toBeInTheDocument();
  });

  it("permiso absent → does NOT render children (gated out)", () => {
    renderWithUser(
      <Can permiso="ticket:eliminar">
        <button>Eliminar</button>
      </Can>,
      userWithAsignar,
    );
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  it("permiso absent + fallback provided → renders the fallback instead", () => {
    renderWithUser(
      <Can permiso="ticket:eliminar" fallback={<span>Sin permiso</span>}>
        <button>Eliminar</button>
      </Can>,
      userWithAsignar,
    );
    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });
});
