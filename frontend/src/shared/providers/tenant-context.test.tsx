/**
 * TenantContext — T5.3 (admin-general PR5a)
 *
 * Contrato: { clienteId, clienteNombre, cicloId, cicloNombre, setCliente, setCiclo }
 *
 * Casos:
 * 1. Usuario regular: clienteId del JWT; cicloId = ciclo activo (fetch GET /ciclos, sin header).
 * 2. Operador (is_global_admin): clienteId = null en primera carga, sin fetch de ciclos.
 * 3. setCliente(...) actualiza el contexto y dispara re-fetch de ciclos del nuevo cliente
 *    (con X-Tenant-Id, porque solo el operador puede setCliente).
 * 4. setCiclo(...) actualiza cicloId/cicloNombre sin disparar fetch.
 * 5. Todos los campos del contrato están expuestos.
 *
 * Spec ref: admin-ui/TenantContext provee cliente + ciclo al dashboard completo
 * Design ref: ADR-3
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useContext } from "react";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { SessionProvider } from "./session-provider";
import { TenantContext, TenantContextProvider } from "./tenant-context";
import type { JwtPayload } from "@/shared/api/types";

const REGULAR_USER: JwtPayload = {
  sub: "u1",
  cliente_id: "cliente-1",
  cliente_nombre: "Acme",
  email: "user@test.com",
  roles: ["USUARIO"],
  permisos: [],
};

const OPERADOR_USER: JwtPayload = {
  sub: "op1",
  cliente_id: "cliente-home",
  email: "nestor@sesitec.com.ar",
  roles: [],
  permisos: [],
  is_global_admin: true,
};

function Consumer() {
  const ctx = useContext(TenantContext);
  return (
    <div>
      <span data-testid="clienteId">{ctx.clienteId ?? "null"}</span>
      <span data-testid="clienteNombre">{ctx.clienteNombre ?? "null"}</span>
      <span data-testid="cicloId">{ctx.cicloId ?? "null"}</span>
      <span data-testid="cicloNombre">{ctx.cicloNombre ?? "null"}</span>
      <button onClick={() => ctx.setCliente("cliente-2", "Beta")}>
        set-cliente
      </button>
      <button onClick={() => ctx.setCiclo("ciclo-x", "Ciclo X")}>
        set-ciclo
      </button>
    </div>
  );
}

function renderWithUser(user: JwtPayload) {
  return render(
    <SessionProvider initialUser={user}>
      <TenantContextProvider>
        <Consumer />
      </TenantContextProvider>
    </SessionProvider>,
  );
}

describe("TenantContext", () => {
  it("usuario regular: clienteId del JWT; cicloId = ciclo activo del tenant", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        // Usuario regular: TenantGuard resuelve el tenant propio — NUNCA debe
        // enviarse X-Tenant-Id (backend responde 403 a no-operadores con el header).
        expect(request.headers.get("x-tenant-id")).toBeNull();
        return HttpResponse.json([
          { id: "c1", nombre: "C1", fechaInicio: "2026-01-01", fechaFin: "2026-06-30", activo: false },
          { id: "c2", nombre: "C2", fechaInicio: "2026-07-01", fechaFin: "2026-12-31", activo: true },
        ]);
      }),
    );

    renderWithUser(REGULAR_USER);

    expect(screen.getByTestId("clienteId").textContent).toBe("cliente-1");
    expect(screen.getByTestId("clienteNombre").textContent).toBe("Acme");

    await waitFor(() =>
      expect(screen.getByTestId("cicloId").textContent).toBe("c2"),
    );
    expect(screen.getByTestId("cicloNombre").textContent).toBe("C2");
  });

  it("operador: clienteId = null en primera carga, sin cliente pre-seleccionado", () => {
    renderWithUser(OPERADOR_USER);

    expect(screen.getByTestId("clienteId").textContent).toBe("null");
    expect(screen.getByTestId("clienteNombre").textContent).toBe("null");
    expect(screen.getByTestId("cicloId").textContent).toBe("null");
  });

  it("setCliente actualiza el contexto y dispara re-fetch del ciclo activo del nuevo cliente", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", ({ request }) => {
        const tenantHeader = request.headers.get("x-tenant-id");
        if (tenantHeader === "cliente-2") {
          return HttpResponse.json([
            {
              id: "cb1",
              nombre: "CB1",
              fechaInicio: "2026-01-01",
              fechaFin: "2026-12-31",
              activo: true,
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    const user = userEvent.setup();
    renderWithUser(OPERADOR_USER);

    await user.click(screen.getByText("set-cliente"));

    expect(screen.getByTestId("clienteId").textContent).toBe("cliente-2");
    expect(screen.getByTestId("clienteNombre").textContent).toBe("Beta");

    await waitFor(() =>
      expect(screen.getByTestId("cicloId").textContent).toBe("cb1"),
    );
    expect(screen.getByTestId("cicloNombre").textContent).toBe("CB1");
  });

  it("setCiclo actualiza cicloId y cicloNombre en el contexto", async () => {
    const user = userEvent.setup();
    renderWithUser(OPERADOR_USER);

    await user.click(screen.getByText("set-ciclo"));

    expect(screen.getByTestId("cicloId").textContent).toBe("ciclo-x");
    expect(screen.getByTestId("cicloNombre").textContent).toBe("Ciclo X");
  });

  it("expone el contrato completo: clienteId, clienteNombre, cicloId, cicloNombre, setCliente, setCiclo", () => {
    function FullConsumer() {
      const ctx = useContext(TenantContext);
      return <div data-testid="keys">{Object.keys(ctx).sort().join(",")}</div>;
    }

    render(
      <SessionProvider initialUser={REGULAR_USER}>
        <TenantContextProvider>
          <FullConsumer />
        </TenantContextProvider>
      </SessionProvider>,
    );

    expect(screen.getByTestId("keys").textContent).toBe(
      "cicloId,cicloNombre,clienteId,clienteNombre,setCiclo,setCliente",
    );
  });
});
