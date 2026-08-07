import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { UsuariosAdminView } from "./usuarios-admin-view";

const USUARIO_JUANA = { id: "u1", nombre: "Juana", apellido: "Pérez", rol: "TECNICO", email: "juana@tenant.com" };

const ROLES = [
  { id: "r1", codigo: "USUARIO", nombre: "Usuario", descripcion: null },
  { id: "r2", codigo: "COLABORADOR", nombre: "Colaborador", descripcion: null },
  { id: "r3", codigo: "TECNICO", nombre: "Técnico de soporte", descripcion: null },
  { id: "r4", codigo: "ADMINISTRADOR", nombre: "Administrador", descripcion: null },
];

function mockBackend() {
  server.use(
    http.get("/api/usuarios", () => HttpResponse.json([USUARIO_JUANA])),
    http.get("/api/roles", () => HttpResponse.json(ROLES)),
  );
}

describe("UsuariosAdminView", () => {
  beforeEach(() => mockBackend());

  it.each([
    ["con usuario:gestionar", ["usuario:gestionar"], true],
    ["sin usuario:gestionar", [], false],
  ])("gate de acceso a Admin > Usuarios — %s", async (_label, permisos, shouldShowContent) => {
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ permisos }) });

    if (shouldShowContent) {
      await screen.findByText("Juana Pérez");
    } else {
      expect(await screen.findByText(/no tenés permiso/i)).toBeInTheDocument();
      expect(screen.queryByText("Juana Pérez")).not.toBeInTheDocument();
    }
  });

  it("con usuario:gestionar PERO SIN rol:asignar — ve la lista, NO ve «Nuevo usuario» (AND, no OR)", async () => {
    renderWithProviders(<UsuariosAdminView />, { user: buildUser({ permisos: ["usuario:gestionar"] }) });
    await screen.findByText("Juana Pérez");
    expect(screen.queryByRole("button", { name: /nuevo usuario/i })).not.toBeInTheDocument();
  });

  it("crear usuario NUNCA envía clienteId — aislamiento tenant estricto (spec §5)", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post("/api/usuarios", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { usuarioId: "u2", email: "nuevo@tenant.com", nombre: "Nuevo", apellido: "Usuario", rol: "TECNICO", membresiaId: "m1", activo: true },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<UsuariosAdminView />, {
      user: buildUser({ permisos: ["usuario:gestionar", "rol:asignar"] }),
    });
    await screen.findByText("Juana Pérez");

    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
    await user.type(screen.getByLabelText(/email/i), "nuevo@tenant.com");
    await user.type(screen.getByLabelText(/^nombre$/i), "Nuevo");
    await user.type(screen.getByLabelText(/^apellido$/i), "Usuario");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await screen.findByRole("option", { name: "Técnico de soporte" });
    await user.selectOptions(screen.getByLabelText("Rol"), "TECNICO");
    await user.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() =>
      expect(Object.keys(capturedBody).sort()).toEqual(["apellido", "email", "nombre", "password", "rolCodigo"].sort()),
    );
    expect(capturedBody.clienteId).toBeUndefined();
    expect(capturedBody.rolCodigo).toBe("TECNICO");
  });

  it("selector de rol se puebla desde GET /roles (nombre legible, no el código crudo hardcodeado)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosAdminView />, {
      user: buildUser({ permisos: ["usuario:gestionar", "rol:asignar"] }),
    });
    await screen.findByText("Juana Pérez");

    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
    expect(await screen.findByRole("option", { name: "Técnico de soporte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Administrador" })).toBeInTheDocument();
  });
});
