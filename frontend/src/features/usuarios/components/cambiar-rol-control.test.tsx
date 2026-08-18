import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { CambiarRolControl } from "./cambiar-rol-control";
import type { UsuarioTenant } from "../types";

const USUARIO: UsuarioTenant = {
  id: "u1",
  nombre: "Ada",
  apellido: "Tec",
  rol: "TECNICO",
  email: "ada@tenant.com",
};

function mockRolesYCambiarRol(capture: (body: Record<string, unknown>) => void) {
  server.use(
    http.get("/api/roles", () =>
      HttpResponse.json([
        { id: "r1", codigo: "TECNICO", nombre: "Técnico", descripcion: null },
        { id: "r2", codigo: "COLABORADOR", nombre: "Colaborador", descripcion: null },
      ]),
    ),
    http.patch("/api/usuarios/u1/rol", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      capture(body);
      return HttpResponse.json({ usuarioId: "u1", rol: body.rolCodigo, membresiaId: "m1", activo: true });
    }),
  );
}

// El cambio de rol NO toca la matriz de permisos: reaplicar la plantilla es una
// operación aparte y vive en `AsignarPermisosControl`. El campo `reaplicarPreset`
// sigue existiendo en el contrato del backend, pero este control ya no lo manda.
describe("CambiarRolControl", () => {
  it("Guardar envía el PATCH con el rol destino, sin flag de preset ni confirmación", async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> = {};
    mockRolesYCambiarRol((body) => (captured = body));

    renderWithProviders(<CambiarRolControl usuario={USUARIO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await screen.findByText("Colaborador");
    await user.selectOptions(screen.getByLabelText(/rol de ada/i), "COLABORADOR");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(captured.rolCodigo).toBe("COLABORADOR"));
    expect(captured.reaplicarPreset).toBeUndefined();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("ya no ofrece el checkbox de reaplicar preset", async () => {
    mockRolesYCambiarRol(() => {});

    renderWithProviders(<CambiarRolControl usuario={USUARIO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await screen.findByText("Colaborador");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
