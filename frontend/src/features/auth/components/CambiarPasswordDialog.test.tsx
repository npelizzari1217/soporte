import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../../test/msw/server";
import { renderWithProviders } from "../../../../test/render-with-providers";
import { CambiarPasswordDialog } from "./CambiarPasswordDialog";

// Spec: sdd/cambio-de-contrasena — WU4, design §"Frontend — detalle".

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

async function abrirDialogYCompletar(
  user: ReturnType<typeof userEvent.setup>,
  { passwordActual = "actual123", passwordNueva = "nueva12345", repetirPassword = "nueva12345" } = {},
) {
  await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
  await user.type(screen.getByLabelText(/contraseña actual/i), passwordActual);
  await user.type(screen.getByLabelText(/^nueva contraseña$/i), passwordNueva);
  await user.type(screen.getByLabelText(/repetir nueva contraseña/i), repetirPassword);
}

describe("CambiarPasswordDialog", () => {
  beforeEach(() => replaceMock.mockClear());

  it("muestra el aviso de que se cierran todas las sesiones", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CambiarPasswordDialog />);
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(screen.getByText(/todas tus sesiones activas, incluida esta/i)).toBeInTheDocument();
  });

  it("204 → navega a /login?motivo=password-cambiada", async () => {
    server.use(
      http.post("/api/auth/change-password", () => new HttpResponse(null, { status: 204 })),
    );

    const user = userEvent.setup();
    renderWithProviders(<CambiarPasswordDialog />);
    await abrirDialogYCompletar(user);
    // El trigger y el botón de submit comparten texto; el submit es el 2do "Cambiar contraseña".
    await user.click(screen.getAllByRole("button", { name: /^cambiar contraseña$/i }).at(-1)!);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login?motivo=password-cambiada"));
  });

  it("422 (contraseña actual incorrecta) → error dentro del formulario, el diálogo NO se cierra", async () => {
    server.use(
      http.post("/api/auth/change-password", () =>
        HttpResponse.json(
          { statusCode: 422, message: "La contraseña actual es incorrecta.", error: "AUTH_PASSWORD_ACTUAL_INCORRECTA" },
          { status: 422 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<CambiarPasswordDialog />);
    await abrirDialogYCompletar(user);
    await user.click(screen.getAllByRole("button", { name: /^cambiar contraseña$/i }).at(-1)!);

    expect(await screen.findByText(/la contraseña actual es incorrecta/i)).toBeInTheDocument();
    // Sigue abierto: el campo de la contraseña nueva sigue en pantalla.
    expect(screen.getByLabelText(/^nueva contraseña$/i)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("las dos contraseñas nuevas no coinciden → error de validación, sin llamar al backend", async () => {
    let llamadoBackend = false;
    server.use(
      http.post("/api/auth/change-password", () => {
        llamadoBackend = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<CambiarPasswordDialog />);
    await abrirDialogYCompletar(user, { repetirPassword: "otraCosa123" });
    await user.click(screen.getAllByRole("button", { name: /^cambiar contraseña$/i }).at(-1)!);

    expect(await screen.findByText(/las contraseñas no coinciden/i)).toBeInTheDocument();
    expect(llamadoBackend).toBe(false);
  });
});
