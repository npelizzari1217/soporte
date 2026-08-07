import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
};

function mockBackend() {
  server.use(http.get("/api/clientes", () => HttpResponse.json([CLIENTE_UNO])));
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
});
