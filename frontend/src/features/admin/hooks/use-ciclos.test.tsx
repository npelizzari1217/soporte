/**
 * useCiclos — T5.6 (admin-general PR5a)
 *
 * Llama a GET /ciclos. Inyecta X-Tenant-Id SOLO cuando isGlobalAdmin === true y hay
 * un clienteId resuelto en TenantContext (backend responde 403 a cualquier
 * no-operador que envíe el header — TenantGuard). Re-fetch cuando clienteId cambia
 * (queryKey incluye clienteId).
 *
 * Spec ref: admin-ui/Selectores; clientes-tenancy/GET /ciclos. Design ADR-3.
 */
import { renderHook, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { useCiclos } from "./use-ciclos";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContext, type TenantContextValue } from "@/shared/providers/tenant-context";
import type { JwtPayload } from "@/shared/api/types";
import { useState, type ReactNode } from "react";

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

function makeTenantValue(clienteId: string | null): TenantContextValue {
  return {
    clienteId,
    clienteNombre: null,
    cicloId: null,
    cicloNombre: null,
    setCliente: () => {},
    setCiclo: () => {},
  };
}

function makeWrapper(qc: QueryClient, user: JwtPayload, clienteId: string | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={user}>
          <TenantContext.Provider value={makeTenantValue(clienteId)}>
            {children}
          </TenantContext.Provider>
        </SessionProvider>
      </QueryClientProvider>
    );
  };
}

describe("useCiclos", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
  });

  it("operador con clienteId → llama GET /ciclos con X-Tenant-Id del TenantContext", async () => {
    let capturedHeader: string | null = null;
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        capturedHeader = request.headers.get("x-tenant-id");
        return HttpResponse.json([
          { id: "c1", nombre: "C1", fechaInicio: "2026-01-01", fechaFin: "2026-06-30", activo: true },
        ]);
      }),
    );

    const { result } = renderHook(() => useCiclos(), {
      wrapper: makeWrapper(qc, OPERADOR, "cliente-2"),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedHeader).toBe("cliente-2");
    expect(result.current.data).toHaveLength(1);
  });

  it("admin-cliente (is_global_admin=false) → llama GET /ciclos SIN X-Tenant-Id", async () => {
    let capturedHeader: string | null = null;
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        capturedHeader = request.headers.get("x-tenant-id");
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useCiclos(), {
      wrapper: makeWrapper(qc, ADMIN_CLIENTE, "cliente-1"),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedHeader).toBeNull();
  });

  it("operador sin clienteId → la query permanece deshabilitada (no ejecuta el fetch)", () => {
    let called = false;
    server.use(
      http.get("http://localhost/api/ciclos", () => {
        called = true;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useCiclos(), {
      wrapper: makeWrapper(qc, OPERADOR, null),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(called).toBe(false);
  });

  it("re-fetch cuando clienteId cambia (cascade)", async () => {
    const calls: (string | null)[] = [];
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        calls.push(request.headers.get("x-tenant-id"));
        return HttpResponse.json([]);
      }),
    );

    function ChangingWrapper({ children }: { children: ReactNode }) {
      const [clienteId, setClienteId] = useState<string | null>("cliente-a");
      return (
        <QueryClientProvider client={qc}>
          <SessionProvider initialUser={OPERADOR}>
            <TenantContext.Provider value={makeTenantValue(clienteId)}>
              <button onClick={() => setClienteId("cliente-b")}>change-cliente</button>
              {children}
            </TenantContext.Provider>
          </SessionProvider>
        </QueryClientProvider>
      );
    }

    renderHook(() => useCiclos(), { wrapper: ChangingWrapper });

    await waitFor(() => expect(calls).toContain("cliente-a"));

    const user = userEvent.setup();
    await user.click(screen.getByText("change-cliente"));

    await waitFor(() => expect(calls).toContain("cliente-b"));
  });
});
