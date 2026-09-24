import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { FeriadosListView } from "./feriados-list-view";

const GLOBAL_ENERO = { id: "g1", fecha: "2026-01-01", descripcion: "Año Nuevo" };
const GLOBAL_MAYO = { id: "g2", fecha: "2026-05-01", descripcion: "Día del Trabajador" };
const CLIENTE_MARZO = { id: "c1", fecha: "2026-03-15", descripcion: "Aniversario del cliente" };

function mockBackendOk() {
  // Fuera de orden a propósito, en ambos endpoints — prueba que la pantalla
  // ordena el resultado combinado, no que confía en el orden de cada fetch.
  server.use(
    http.get("/api/feriados", () => HttpResponse.json([GLOBAL_MAYO, GLOBAL_ENERO])),
    http.get("/api/feriados-cliente", () => HttpResponse.json([CLIENTE_MARZO])),
  );
}

describe("FeriadosListView (/feriados, task 8.1, WU8a)", () => {
  beforeEach(() => {
    mockBackendOk();
  });

  // spec.md "Per-client admin manages its own holidays; other roles read":
  // esta pantalla NO gatea por esAdminCliente — cualquier autenticado del
  // tenant ve la lista combinada.
  it.each([
    ["TECNICO sin permisos", buildUser({ rol: "TECNICO", permisos: [] })],
    ["ADMINISTRADOR", buildUser({ rol: "ADMINISTRADOR" })],
  ])("%s ve la lista combinada, sin gate de admin", async (_label, user) => {
    renderWithProviders(<FeriadosListView />, { user });

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("Aniversario del cliente")).toBeInTheDocument();
    expect(screen.getByText("Día del Trabajador")).toBeInTheDocument();
  });

  it("combina ambas listas ordenadas por fecha, con el badge de origen correcto por fila", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    const filas = screen.getAllByRole("row").slice(1); // descarta el header
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("Año Nuevo");
    expect(filas[1]).toHaveTextContent("Aniversario del cliente");
    expect(filas[2]).toHaveTextContent("Día del Trabajador");

    expect(filas[0]).toHaveTextContent("Nacional");
    expect(filas[1]).toHaveTextContent("Del cliente");
    expect(filas[2]).toHaveTextContent("Nacional");
  });

  it("muestra la fecha en formato dd/mm/yyyy, nunca el ISO crudo", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    expect(screen.getByText("15/03/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-15")).not.toBeInTheDocument();
  });

  it("sin filas GLOBAL sin filas CLIENTE (ninguna de las dos tiene datos) → estado vacío, no error", async () => {
    server.use(
      http.get("/api/feriados", () => HttpResponse.json([])),
      http.get("/api/feriados-cliente", () => HttpResponse.json([])),
    );
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    expect(await screen.findByText("Sin feriados")).toBeInTheDocument();
  });

  it("no muestra ninguna columna de Acciones (WU8a es solo lectura)", async () => {
    renderWithProviders(<FeriadosListView />, { user: buildUser({ rol: "TECNICO" }) });

    await screen.findByText("Año Nuevo");
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  // TenantGuard responde 403 cuando el JWT no trae `cliente_id`
  // (`tenant.guard.ts:55-57`) — el caso de un ROOT en sesión MASTER
  // (`cliente_id: null`) que todavía no eligió un tenant. Sin gate propio
  // para ese caso: se sigue el mismo camino de error genérico que cualquier
  // otra pantalla scopeada a tenant (ej. `/compras`, `/ciclos`) — ni crashea
  // ni banner especial, DataTable muestra el ErrorState reutilizable.
  it("ROOT sin tenant elegido (cliente_id: null) → falla feriados-cliente con 403 y la pantalla muestra el error genérico, sin crashear", async () => {
    server.use(
      http.get("/api/feriados", () => HttpResponse.json([GLOBAL_ENERO])),
      http.get("/api/feriados-cliente", () =>
        HttpResponse.json({ statusCode: 403, message: "Acceso denegado: tenant no identificado" }, { status: 403 }),
      ),
    );

    renderWithProviders(<FeriadosListView />, {
      user: buildUser({ is_global_admin: true, cliente_id: null, rol: "TECNICO" }),
    });

    expect(await screen.findByText("No se pudieron cargar los feriados.")).toBeInTheDocument();
    expect(screen.queryByText("Año Nuevo")).not.toBeInTheDocument();
  });
});
