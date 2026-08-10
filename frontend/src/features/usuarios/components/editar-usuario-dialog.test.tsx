import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EditarUsuarioDialog } from "./editar-usuario-dialog";
import type { UsuarioTenant } from "../types";

const USUARIO: UsuarioTenant = {
  id: "u1",
  nombre: "Ada",
  apellido: "Vieja",
  rol: "TECNICO",
  email: "ada@tenant.com",
};

describe("EditarUsuarioDialog (spec §5)", () => {
  it("precarga nombre/apellido, muestra el email deshabilitado y envía SOLO {nombre, apellido}", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.patch("/api/usuarios/u1", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ usuarioId: "u1", nombre: "Ada", apellido: "Lovelace" });
      }),
    );

    renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
      user: buildUser({ permisos: ["usuario:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /editar/i }));

    // Valores precargados del row.
    expect(await screen.findByLabelText(/^nombre$/i)).toHaveValue("Ada");
    expect(screen.getByLabelText(/^apellido$/i)).toHaveValue("Vieja");
    // El email se muestra pero NO se puede editar.
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveValue("ada@tenant.com");
    expect(email).toBeDisabled();

    // Edita el apellido y guarda.
    await user.clear(screen.getByLabelText(/^apellido$/i));
    await user.type(screen.getByLabelText(/^apellido$/i), "Lovelace");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(Object.keys(capturedBody).sort()).toEqual(["apellido", "nombre"]),
    );
    expect(capturedBody).toEqual({ nombre: "Ada", apellido: "Lovelace" });
    expect(capturedBody.clienteId).toBeUndefined();
    expect(capturedBody.email).toBeUndefined();
  });
});
