import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { ClientesAdminView } from "./clientes-admin-view";

const CLIENTE_UNO = {
  id: "c1",
  nombre: "Cliente Uno",
  razonSocial: null,
  cuit: null,
  dbName: "tenant_c1",
  activo: true,
  csatHabilitado: false,
  correo: { configurado: false, verificadoAt: null },
};

const CLIENTE_INACTIVO = {
  id: "c9",
  nombre: "Cliente Inactivo",
  razonSocial: null,
  cuit: null,
  dbName: "tenant_c9",
  activo: false,
  csatHabilitado: false,
  correo: { configurado: false, verificadoAt: null },
};

function mockBackend(clientes: unknown[] = [CLIENTE_UNO]) {
  server.use(http.get("/api/clientes", () => HttpResponse.json(clientes)));
}

describe("ClientesAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["ROOT (is_global_admin)", true, ["catalogo:gestionar"], true],
    ["ADMINISTRADOR de tenant (con TODOS los permisos pero sin is_global_admin)", false, ["catalogo:gestionar", "cliente:gestionar"], false],
  ])("gate de acceso a Admin > Clientes es por is_global_admin, NUNCA por permisos — %s", async (_label, isGlobalAdmin, permisos, shouldShowContent) => {
    renderWithProviders(<ClientesAdminView />, { user: buildUser({ permisos, is_global_admin: isGlobalAdmin }) });

    if (shouldShowContent) {
      await screen.findByText("Cliente Uno");
    } else {
      expect(await screen.findByText(/solo.*root/i)).toBeInTheDocument();
      expect(screen.queryByText("Cliente Uno")).not.toBeInTheDocument();
    }
  });

  it("crear cliente no envía ningún campo fuera del DTO (POST /clientes)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/clientes", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CLIENTE_UNO, id: "c2", nombre: "Cliente Dos" }, { status: 201 });
      }),
    );

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Uno");

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), "Cliente Dos");
    await user.type(screen.getByLabelText(/email.*admin/i), "admin@clientedos.com");
    await user.type(screen.getByLabelText(/nombre.*admin/i), "Ana");
    await user.type(screen.getByLabelText(/apellido.*admin/i), "Gómez");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => expect(Object.keys(capturedBody).sort()).toEqual(
      ["adminApellido", "adminEmail", "adminNombre", "adminPassword", "nombre"].sort(),
    ));
  });

  it("editar cliente hace PATCH /clientes/:id con los datos comerciales (sin dbName)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    let capturedUrl = "";
    server.use(
      http.patch("/api/clientes/:id", async ({ request, params }) => {
        capturedUrl = String(params.id);
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CLIENTE_UNO, nombre: "Cliente Editado" });
      }),
    );

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Uno");

    await user.click(screen.getByRole("button", { name: /editar cliente uno/i }));
    const nombre = await screen.findByLabelText(/^nombre$/i);
    await user.clear(nombre);
    await user.type(nombre, "Cliente Editado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(capturedUrl).toBe("c1"));
    expect(capturedBody).toEqual({ nombre: "Cliente Editado" });
  });

  it("desactivar cliente activo confirma y hace PATCH /clientes/:id/desactivar", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.patch("/api/clientes/:id/desactivar", ({ params }) => {
        called = params.id === "c1";
        return HttpResponse.json({ ...CLIENTE_UNO, activo: false });
      }),
    );

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Uno");

    await user.click(screen.getByRole("button", { name: /desactivar/i }));
    // El ConfirmDialog exige confirmación explícita antes de mutar.
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /desactivar/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it("el listado muestra el estado de correo por cliente (D7, decisión #2359)", async () => {
    mockBackend([
      CLIENTE_UNO,
      { ...CLIENTE_INACTIVO, correo: { configurado: true, verificadoAt: "2026-01-01T00:00:00.000Z" } },
    ]);

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Uno");

    expect(screen.getByText("Correo no configurado")).toBeInTheDocument();
    expect(screen.getByText("Correo configurado")).toBeInTheDocument();
  });

  it("guardar correo con la contraseña vacía en un cliente YA configurado NO manda password (PATCH /clientes/:id/correo)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.get("/api/clientes/:id/correo", () =>
        HttpResponse.json({
          configurado: true,
          host: "smtp.cliente-uno.com",
          port: 587,
          user: "user@cliente-uno.com",
          secure: true,
          from: "no-reply@cliente-uno.com",
          verificadoAt: "2026-01-01T00:00:00.000Z",
          verificacionError: null,
        }),
      ),
      http.patch("/api/clientes/:id/correo", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          configurado: true,
          host: "smtp.cliente-uno.com",
          port: 587,
          user: "user@cliente-uno.com",
          secure: true,
          from: "no-reply@cliente-uno.com",
          verificadoAt: "2026-01-01T00:00:00.000Z",
          verificacionError: null,
        });
      }),
    );

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Uno");

    await user.click(screen.getByRole("button", { name: /correo de cliente uno/i }));
    // Espera a que `GET /clientes/:id/correo` prellene el form antes de guardar.
    await screen.findByDisplayValue("smtp.cliente-uno.com");

    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(capturedBody.host).toBe("smtp.cliente-uno.com"));
    expect(capturedBody).not.toHaveProperty("password");
  });

  it("activar cliente inactivo hace PATCH /clientes/:id/activar (directo, sin confirm)", async () => {
    mockBackend([CLIENTE_INACTIVO]);
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.patch("/api/clientes/:id/activar", ({ params }) => {
        called = params.id === "c9";
        return HttpResponse.json({ ...CLIENTE_INACTIVO, activo: true });
      }),
    );

    renderWithProviders(<ClientesAdminView />, { user: buildUser({ is_global_admin: true }) });
    await screen.findByText("Cliente Inactivo");

    await user.click(screen.getByRole("button", { name: /^activar$/i }));

    await waitFor(() => expect(called).toBe(true));
  });
});
