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

// R6 (sdd/matriz-permisos-por-usuario, confirmacion-r6): sin el checkbox de
// "reaplicar preset", el rol cambia y la matriz queda INTACTA — con el
// checkbox, SOBRESCRIBE, y por eso exige confirmación explícita antes de
// enviarlo (pisa ajustes finos hechos a mano en la grilla).
describe("CambiarRolControl — reaplicarPreset (R6)", () => {
  it("Guardar sin tildar 'reaplicar preset' → PATCH sin el flag, sin pedir confirmación", async () => {
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

  it("Guardar CON 'reaplicar preset' tildado → pide confirmación; confirmar envía { reaplicarPreset: true }", async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> = {};
    mockRolesYCambiarRol((body) => (captured = body));

    renderWithProviders(<CambiarRolControl usuario={USUARIO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await screen.findByText("Colaborador");
    await user.selectOptions(screen.getByLabelText(/rol de ada/i), "COLABORADOR");
    await user.click(screen.getByRole("checkbox", { name: /reaplicar preset/i }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(captured.reaplicarPreset).toBe(true));
    expect(captured.rolCodigo).toBe("COLABORADOR");
  });

  it("cancelar la confirmación NO envía el PATCH", async () => {
    const user = userEvent.setup();
    let called = false;
    mockRolesYCambiarRol(() => (called = true));

    renderWithProviders(<CambiarRolControl usuario={USUARIO} />, {
      user: buildUser({ rol: "ADMINISTRADOR" }),
    });

    await screen.findByText("Colaborador");
    await user.selectOptions(screen.getByLabelText(/rol de ada/i), "COLABORADOR");
    await user.click(screen.getByRole("checkbox", { name: /reaplicar preset/i }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(called).toBe(false);
  });
});
