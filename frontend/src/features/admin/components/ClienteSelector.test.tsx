/**
 * ClienteSelector — T5.8 (admin-general PR5a)
 *
 * Dropdown de selección de tenant, exclusivo del operador global.
 *
 * Tests:
 * - Renderizado solo para isGlobalAdmin=true; null para otros usuarios.
 * - Skeleton durante carga de opciones.
 * - Selección actualiza TenantContext.clienteId + clienteNombre.
 * - Cambio de cliente → resetea el ciclo al ciclo activo del nuevo cliente (cascade,
 *   delegado en TenantContext — ver tenant-context.test.tsx).
 * - Estado de carga correcto (disabled mientras carga).
 *
 * Spec ref: admin-ui/Selectores — Operador ve ambos selectores
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/shared/providers/session-provider";
import { TenantContextProvider, TenantContext } from "@/shared/providers/tenant-context";
import { ClienteSelector } from "./ClienteSelector";
import type { JwtPayload } from "@/shared/api/types";
import { useContext } from "react";

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

const CLIENTES = [
  { id: "cliente-a", nombre: "Acme Corp", activo: true, dbName: "db_a", createdAt: "2026-01-01" },
  { id: "cliente-b", nombre: "Beta SA", activo: true, dbName: "db_b", createdAt: "2026-01-01" },
];

function CicloIdProbe() {
  const ctx = useContext(TenantContext);
  return <span data-testid="ciclo-id">{ctx.cicloId ?? "null"}</span>;
}

function renderSelector(user: JwtPayload) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TenantContextProvider>
          <ClienteSelector />
          <CicloIdProbe />
        </TenantContextProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("ClienteSelector", () => {
  it("no renderiza nada para un usuario que no es operador global", () => {
    renderSelector(ADMIN_CLIENTE);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("muestra skeleton mientras carga GET /clientes, luego habilita el selector", async () => {
    server.use(
      http.get("http://localhost/api/clientes", async () => {
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json(CLIENTES);
      }),
    );

    renderSelector(OPERADOR);

    // Mientras carga: skeleton visible, sin combobox interactivo todavía.
    expect(screen.getByTestId("cliente-selector-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();

    // Una vez cargado: combobox habilitado, skeleton desaparece.
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    expect(screen.queryByTestId("cliente-selector-skeleton")).toBeNull();
  });

  it("selección actualiza TenantContext.clienteId + clienteNombre", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.get("http://localhost/api/ciclos", () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderSelector(OPERADOR);

    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger).not.toBeDisabled());

    await user.click(trigger);
    const body = within(document.body);
    await user.click(body.getByRole("option", { name: "Beta SA" }));

    expect(screen.getByRole("combobox")).toHaveTextContent("Beta SA");
  });

  it("cambio de cliente resetea el ciclo al ciclo activo del nuevo cliente", async () => {
    server.use(
      http.get("http://localhost/api/clientes", () => HttpResponse.json(CLIENTES)),
      http.get("http://localhost/api/ciclos", ({ request }) => {
        const tenant = request.headers.get("x-tenant-id");
        if (tenant === "cliente-b") {
          return HttpResponse.json([
            { id: "ciclo-b-activo", nombre: "Ciclo B", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", activo: true },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );

    const user = userEvent.setup();
    renderSelector(OPERADOR);

    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger).not.toBeDisabled());

    await user.click(trigger);
    const body = within(document.body);
    await user.click(body.getByRole("option", { name: "Beta SA" }));

    await waitFor(() =>
      expect(screen.getByTestId("ciclo-id").textContent).toBe("ciclo-b-activo"),
    );
  });

});
