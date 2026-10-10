import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "../../../../test/msw/server";
import { renderWithProviders, buildUser } from "../../../../test/render-with-providers";
import { EditarUsuarioDialog } from "./editar-usuario-dialog";
import type { UsuarioTenant } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USUARIO: UsuarioTenant = {
  id: "u1",
  nombre: "Ada",
  apellido: "Vieja",
  rol: "TECNICO",
  email: "ada@tenant.com",
};

/**
 * Los tres desenlaces alcanzables de ADR-3 (`design.md:138-143`, secuencia
 * de dos mutaciones con corte) más el caso "campo vacío ⇒ una sola llamada"
 * (fila 8 de la tabla de abuso, `design.md:371`).
 */
describe("EditarUsuarioDialog (spec §5, ADR-3 reset-de-contrasena-por-admin)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

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

    // Edita el apellido y guarda, sin tocar la contraseña.
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

  it("desenlace 1: identidad Y contraseña ok — toast único y el diálogo cierra", async () => {
    const user = userEvent.setup();
    let capturedIdentidad: Record<string, unknown> = {};
    let capturedPassword: Record<string, unknown> = {};
    server.use(
      http.patch("/api/usuarios/u1", async ({ request }) => {
        capturedIdentidad = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ usuarioId: "u1", nombre: "Ada", apellido: "Lovelace" });
      }),
      http.patch("/api/usuarios/u1/password", async ({ request }) => {
        capturedPassword = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
      user: buildUser({ permisos: ["usuario:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/^nombre$/i);

    await user.clear(screen.getByLabelText(/^apellido$/i));
    await user.type(screen.getByLabelText(/^apellido$/i), "Lovelace");
    await user.type(screen.getByLabelText(/contraseña nueva/i), "unaClaveNueva");
    await user.type(screen.getByLabelText(/repetir contraseña/i), "unaClaveNueva");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Usuario actualizado. Contraseña restablecida: las sesiones del usuario se cerraron.",
      ),
    );
    expect(capturedIdentidad).toEqual({ nombre: "Ada", apellido: "Lovelace" });
    expect(capturedPassword).toEqual({ password: "unaClaveNueva" });
    // Cierra: los campos del form ya no están en el documento.
    expect(screen.queryByLabelText(/^nombre$/i)).not.toBeInTheDocument();
  });

  it("desenlace 2: falla el PATCH de identidad — el reset NUNCA se emite y el diálogo queda abierto", async () => {
    const user = userEvent.setup();
    let passwordCalls = 0;
    server.use(
      http.patch("/api/usuarios/u1", () =>
        HttpResponse.json({ statusCode: 403, message: "No autorizado" }, { status: 403 }),
      ),
      http.patch("/api/usuarios/u1/password", () => {
        passwordCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
      user: buildUser({ permisos: ["usuario:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/^nombre$/i);

    await user.clear(screen.getByLabelText(/^apellido$/i));
    await user.type(screen.getByLabelText(/^apellido$/i), "Lovelace");
    await user.type(screen.getByLabelText(/contraseña nueva/i), "unaClaveNueva");
    await user.type(screen.getByLabelText(/repetir contraseña/i), "unaClaveNueva");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No autorizado No se guardó nada: la contraseña tampoco se cambió.",
      ),
    );
    // Corte estructural (ADR-3): la segunda llamada nunca sale.
    expect(passwordCalls).toBe(0);
    expect(toast.success).not.toHaveBeenCalled();
    // El diálogo NO cierra: cerrar destruiría la contraseña tipeada.
    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument();
  });

  it("desenlace 3: identidad ok, falla el reset — mensaje explícito y el diálogo queda abierto", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("/api/usuarios/u1", () =>
        HttpResponse.json({ usuarioId: "u1", nombre: "Ada", apellido: "Lovelace" }),
      ),
      http.patch("/api/usuarios/u1/password", () =>
        HttpResponse.json(
          { statusCode: 422, message: "La cuenta global está inactiva" },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
      user: buildUser({ permisos: ["usuario:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/^nombre$/i);

    await user.clear(screen.getByLabelText(/^apellido$/i));
    await user.type(screen.getByLabelText(/^apellido$/i), "Lovelace");
    await user.type(screen.getByLabelText(/contraseña nueva/i), "unaClaveNueva");
    await user.type(screen.getByLabelText(/repetir contraseña/i), "unaClaveNueva");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Se guardaron nombre y apellido, pero la contraseña NO se cambió: La cuenta global está inactiva",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    // El diálogo NO cierra: nombre/apellido ya se guardaron, pero la
    // credencial quedó intacta y el admin necesita poder reintentar.
    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument();
  });

  it("campo de contraseña vacío ⇒ el endpoint de password NUNCA se llama (una sola llamada)", async () => {
    const user = userEvent.setup();
    let passwordCalls = 0;
    server.use(
      http.patch("/api/usuarios/u1", () =>
        HttpResponse.json({ usuarioId: "u1", nombre: "Ada", apellido: "Lovelace" }),
      ),
      http.patch("/api/usuarios/u1/password", () => {
        passwordCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
      user: buildUser({ permisos: ["usuario:gestionar"] }),
    });

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/^nombre$/i);

    await user.clear(screen.getByLabelText(/^apellido$/i));
    await user.type(screen.getByLabelText(/^apellido$/i), "Lovelace");
    // El campo de contraseña queda vacío a propósito.
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Usuario actualizado."));
    expect(passwordCalls).toBe(0);
  });
  describe("Resetear 2FA (S1, S2, S4)", () => {
    it("pide confirmación y llama a DELETE /usuarios/:id/2fa", async () => {
      const user = userEvent.setup();
      let llamadas = 0;
      server.use(
        http.delete("/api/usuarios/u1/2fa", () => {
          llamadas += 1;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
        user: buildUser({ rol: "ADMINISTRADOR" }),
      });
      await user.click(screen.getByRole("button", { name: /editar/i }));
      await user.click(await screen.findByRole("button", { name: /resetear 2fa/i }));

      expect(await screen.findByText(/tendrá que configurarla de nuevo/i)).toBeInTheDocument();
      expect(llamadas).toBe(0);
      await user.click(screen.getByRole("button", { name: /^resetear$/i }));

      await waitFor(() => expect(llamadas).toBe(1));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it("un 404 muestra un mensaje neutro sin revelar el motivo", async () => {
      const user = userEvent.setup();
      server.use(
        http.delete("/api/usuarios/u1/2fa", () =>
          HttpResponse.json({ message: "Usuario no encontrado" }, { status: 404 }),
        ),
      );
      renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
        user: buildUser({ rol: "ADMINISTRADOR" }),
      });
      await user.click(screen.getByRole("button", { name: /editar/i }));
      await user.click(await screen.findByRole("button", { name: /resetear 2fa/i }));
      await user.click(await screen.findByRole("button", { name: /^resetear$/i }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("No se pudo resetear el 2FA de este usuario."),
      );
    });
  });

  describe("Resetear vínculo SSO (SV7, SV8)", () => {
    it("aparece junto a Resetear 2FA, pide confirmación y llama a DELETE /usuarios/:id/sso", async () => {
      const user = userEvent.setup();
      let llamadas = 0;
      server.use(
        http.delete("/api/usuarios/u1/sso", () => {
          llamadas += 1;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
        user: buildUser({ rol: "ADMINISTRADOR" }),
      });
      await user.click(screen.getByRole("button", { name: /editar/i }));
      expect(await screen.findByRole("button", { name: /resetear 2fa/i })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /resetear vínculo sso/i }));

      expect(await screen.findByText(/se cierran sus sesiones abiertas/i)).toBeInTheDocument();
      expect(llamadas).toBe(0);
      await user.click(screen.getByRole("button", { name: /^resetear$/i }));

      await waitFor(() => expect(llamadas).toBe(1));
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/vínculo sso reseteado/i)),
      );
    });

    it("un 404 muestra un mensaje neutro sin revelar el motivo", async () => {
      const user = userEvent.setup();
      server.use(
        http.delete("/api/usuarios/u1/sso", () =>
          HttpResponse.json({ message: "Usuario no encontrado" }, { status: 404 }),
        ),
      );
      renderWithProviders(<EditarUsuarioDialog usuario={USUARIO} />, {
        user: buildUser({ rol: "ADMINISTRADOR" }),
      });
      await user.click(screen.getByRole("button", { name: /editar/i }));
      await user.click(await screen.findByRole("button", { name: /resetear vínculo sso/i }));
      await user.click(await screen.findByRole("button", { name: /^resetear$/i }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("No se pudo resetear el vínculo SSO de este usuario."),
      );
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
