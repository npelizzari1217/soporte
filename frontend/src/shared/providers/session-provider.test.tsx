import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useContext } from "react";
import { SessionProvider, SessionContext } from "./session-provider";
import type { JwtPayload } from "@/shared/api/types";

// Spec: PR11 — SessionProvider hidrata la sesión desde el JWT server-decoded,
// setUser permite al TenantSwitcher aplicar el usuario re-emitido sin reload.

const PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
  modulos: [],
  nombre: "Juan",
  apellido: "Pérez",
};

function Probe() {
  const { user, isLoading, setUser } = useContext(SessionContext);
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="cliente">{user?.cliente_nombre ?? "none"}</span>
      <button
        onClick={() =>
          setUser({ ...PAYLOAD, cliente_id: "c2", cliente_nombre: "Cliente Dos" })
        }
      >
        switch
      </button>
    </div>
  );
}

describe("SessionProvider", () => {
  it("no initialUser → isLoading true, user null", () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("cliente")).toHaveTextContent("none");
  });

  it("initialUser provided → isLoading false immediately, user hydrated (no FOUC)", () => {
    render(
      <SessionProvider initialUser={PAYLOAD}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("cliente")).toHaveTextContent("Cliente Uno");
  });

  it("setUser → replaces the session user in place (used by the tenant switcher)", async () => {
    render(
      <SessionProvider initialUser={PAYLOAD}>
        <Probe />
      </SessionProvider>,
    );

    await act(async () => {
      screen.getByText("switch").click();
    });

    expect(screen.getByTestId("cliente")).toHaveTextContent("Cliente Dos");
  });
});
