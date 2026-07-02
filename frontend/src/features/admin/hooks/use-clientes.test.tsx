/**
 * useClientes — T5.6 (admin-general PR5a)
 *
 * Llama a GET /clientes (solo operador global). Query deshabilitada para cualquier
 * usuario sin is_global_admin: true — el backend igual rechazaría con 403
 * (GlobalAdminGuard), pero la UI no debe ni intentar el fetch (evita 403 ruidosos
 * en la consola y respeta el patrón "enabled" de TanStack Query del proyecto).
 *
 * Spec ref: admin-ui/Selectores — Operador ve ambos selectores; clientes-tenancy/GET /clientes
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useClientes } from "./use-clientes";
import { SessionProvider } from "@/shared/providers/session-provider";
import type { JwtPayload } from "@/shared/api/types";
import type { ReactNode } from "react";

const OPERADOR: JwtPayload = {
  sub: "op1",
  cliente_id: "home",
  email: "op@test.com",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

const ADMIN_CLIENTE: JwtPayload = {
  sub: "a1",
  cliente_id: "cliente-1",
  email: "admin@test.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(qc: QueryClient, user: JwtPayload) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={user}>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}

describe("useClientes", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
  });

  it("is_global_admin=true → llama GET /clientes y retorna la lista", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () =>
        HttpResponse.json([
          { id: "c1", nombre: "Acme", activo: true, dbName: "db_acme", createdAt: "2026-01-01" },
        ]),
      ),
    );

    const { result } = renderHook(() => useClientes(), {
      wrapper: makeWrapper(qc, OPERADOR),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "c1", nombre: "Acme", activo: true, dbName: "db_acme", createdAt: "2026-01-01" },
    ]);
  });

  it("is_global_admin=false → la query permanece deshabilitada (no ejecuta el fetch)", () => {
    let called = false;
    server.use(
      http.get("http://localhost/api/clientes", () => {
        called = true;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useClientes(), {
      wrapper: makeWrapper(qc, ADMIN_CLIENTE),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });

  it("propaga error del backend (500) como isError", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () =>
        HttpResponse.json({ statusCode: 500, message: "Internal Server Error" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useClientes(), {
      wrapper: makeWrapper(qc, OPERADOR),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
