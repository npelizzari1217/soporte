import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionProvider } from "@/shared/providers/session-provider";
import { useSession } from "./use-session";
import type { JwtPayload } from "@/shared/api/types";

// Spec: PR11 — useSession expone can(permiso) e isGlobalAdmin derivados del JWT.

const ROOT_PAYLOAD: JwtPayload = {
  sub: "1",
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  membresias: [
    { cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" },
    { cliente_id: "c2", nombre: "Cliente Dos", rol: "TECNICO" },
  ],
};

const TENANT_PAYLOAD: JwtPayload = {
  sub: "2",
  cliente_id: "c1",
  rol: "USUARIO",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "USUARIO" }],
};

function Probe() {
  const { isGlobalAdmin, can } = useSession();
  return (
    <div>
      <span data-testid="admin">{String(isGlobalAdmin)}</span>
      <span data-testid="can-crear">{String(can("ticket:crear"))}</span>
      <span data-testid="can-borrar">{String(can("ticket:borrar"))}</span>
    </div>
  );
}

describe("useSession", () => {
  it("root MASTER token (is_global_admin: true, cliente_id: null) → isGlobalAdmin true", () => {
    render(
      <SessionProvider initialUser={ROOT_PAYLOAD}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("true");
  });

  it("tenant-scoped user → isGlobalAdmin false, can() reflects permisos array exactly", () => {
    render(
      <SessionProvider initialUser={TENANT_PAYLOAD}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(screen.getByTestId("can-crear")).toHaveTextContent("true");
    expect(screen.getByTestId("can-borrar")).toHaveTextContent("false");
  });

  it("no user (loading) → can() always false, isGlobalAdmin false", () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(screen.getByTestId("can-crear")).toHaveTextContent("false");
  });
});
