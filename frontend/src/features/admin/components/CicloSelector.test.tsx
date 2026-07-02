/**
 * CicloSelector — T5.10 (admin-general PR5a)
 *
 * Dropdown de selección de ciclo, visible para operador global y ADMINISTRADOR.
 * Ausente para roles operativos (USUARIO, COLABORADOR, TECNICO) — el tenant y ciclo
 * activo se resuelven implícitamente desde el JWT para esos usuarios.
 *
 * Tests:
 * - Renderizado para isGlobalAdmin y ADMINISTRADOR; ausente para USUARIO.
 * - Default = ciclo activo (resuelto por TenantContext).
 * - Selección actualiza TenantContext.cicloId + cicloNombre.
 * - Re-fetch de ciclos cuando TenantContext.clienteId cambia (cascade).
 *
 * Spec ref: admin-ui/Selectores — Admin-cliente ve solo selector de Ciclo
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContextProvider } from "@/shared/providers/tenant-context";
import { CicloSelector } from "./CicloSelector";
import { ClienteSelector } from "./ClienteSelector";
import type { JwtPayload } from "@/shared/api/types";

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
  cliente_nombre: "Acme",
  email: "admin@test.com",
  roles: ["ADMINISTRADOR"],
  permisos: [],
  is_global_admin: false,
};

const USUARIO_REGULAR: JwtPayload = {
  sub: "u1",
  cliente_id: "cliente-1",
  cliente_nombre: "Acme",
  email: "user@test.com",
  roles: ["USUARIO"],
  permisos: [],
};

const CICLOS_CLIENTE_1 = [
  { id: "c1", nombre: "Ciclo 1", fechaInicio: "2026-01-01", fechaFin: "2026-06-30", activo: false },
  { id: "c2", nombre: "Ciclo 2", fechaInicio: "2026-07-01", fechaFin: "2026-12-31", activo: true },
];

function renderSelector(user: JwtPayload, withClienteSelector = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TenantContextProvider>
          {withClienteSelector && <ClienteSelector />}
          <CicloSelector />
        </TenantContextProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("CicloSelector", () => {
  it("no renderiza nada para un usuario con rol operativo (USUARIO)", () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS_CLIENTE_1)),
    );
    renderSelector(USUARIO_REGULAR);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renderiza para ADMINISTRADOR (is_global_admin=false) con el ciclo activo por defecto", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS_CLIENTE_1)),
    );

    renderSelector(ADMIN_CLIENTE);

    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger).toHaveTextContent("Ciclo 2"));
  });

  it("renderiza para el operador global", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json([])),
    );
    renderSelector(OPERADOR);
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("selección actualiza el ciclo elegido en la UI", async () => {
    server.use(
      http.get("http://localhost/api/ciclos", () => HttpResponse.json(CICLOS_CLIENTE_1)),
    );

    const user = userEvent.setup();
    renderSelector(ADMIN_CLIENTE);

    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger).toHaveTextContent("Ciclo 2"));

    await user.click(trigger);
    const body = within(document.body);
    await user.click(body.getByRole("option", { name: "Ciclo 1" }));

    expect(screen.getByRole("combobox")).toHaveTextContent("Ciclo 1");
  });

  it("re-fetch de ciclos cuando el operador cambia de cliente (cascade)", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () =>
        HttpResponse.json([
          { id: "cliente-a", nombre: "Acme Corp", activo: true, dbName: "db_a", createdAt: "2026-01-01" },
          { id: "cliente-b", nombre: "Beta SA", activo: true, dbName: "db_b", createdAt: "2026-01-01" },
        ]),
      ),
      http.get("http://localhost/api/ciclos", ({ request }) => {
        const tenant = request.headers.get("x-tenant-id");
        if (tenant === "cliente-b") {
          return HttpResponse.json([
            { id: "cb1", nombre: "Ciclo Beta", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", activo: true },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    const user = userEvent.setup();
    renderSelector(OPERADOR, true);

    const clienteTrigger = await screen.findByRole("combobox", {
      name: "Seleccionar cliente",
    });
    await waitFor(() => expect(clienteTrigger).not.toBeDisabled());

    await user.click(clienteTrigger);
    const body = within(document.body);
    await user.click(body.getByRole("option", { name: "Beta SA" }));

    await waitFor(() => {
      const cicloTrigger = screen.getByRole("combobox", {
        name: "Seleccionar ciclo",
      });
      expect(cicloTrigger).toHaveTextContent("Ciclo Beta");
    });
  });
});
