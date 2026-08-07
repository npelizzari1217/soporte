import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCan } from "./use-can";
import { SessionContext } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";

function wrapperWithUser(user: JwtPayload | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SessionContext.Provider value={{ user, isLoading: false, setUser: () => {} }}>
        {children}
      </SessionContext.Provider>
    );
  };
}

describe("useCan", () => {
  it("user has 'ticket:asignar' → useCan('ticket:asignar') returns true", () => {
    const user: JwtPayload = {
      sub: "1",
      cliente_id: "c1",
      rol: "TECNICO",
      permisos: ["ticket:asignar"],
      is_global_admin: false,
      cliente_nombre: "Cliente Uno",
      membresias: [],
      modulos: [],
    };
    const { result } = renderHook(() => useCan("ticket:asignar"), { wrapper: wrapperWithUser(user) });
    expect(result.current).toBe(true);
  });

  it("user does NOT have the permiso → returns false", () => {
    const user: JwtPayload = {
      sub: "1",
      cliente_id: "c1",
      rol: "USUARIO",
      permisos: ["ticket:crear"],
      is_global_admin: false,
      cliente_nombre: "Cliente Uno",
      membresias: [],
      modulos: [],
    };
    const { result } = renderHook(() => useCan("ticket:asignar"), { wrapper: wrapperWithUser(user) });
    expect(result.current).toBe(false);
  });

  it("no user (unauthenticated) → returns false, does not throw", () => {
    const { result } = renderHook(() => useCan("ticket:asignar"), { wrapper: wrapperWithUser(null) });
    expect(result.current).toBe(false);
  });
});
