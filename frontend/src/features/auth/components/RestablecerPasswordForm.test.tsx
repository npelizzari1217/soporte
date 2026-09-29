import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestablecerPasswordForm } from "./RestablecerPasswordForm";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
// flujo completo de self-service", escenario "La confirmación valida antes
// de enviar".

describe("RestablecerPasswordForm", () => {
  it("contraseña corta → error de validación local, no llama a onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RestablecerPasswordForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/^nueva contraseña$/i), "corta1");
    await user.type(screen.getByLabelText(/repetir nueva contraseña/i), "corta1");
    await user.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    expect(await screen.findByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("las dos contraseñas no coinciden → error de validación local, no llama a onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RestablecerPasswordForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/^nueva contraseña$/i), "nueva12345");
    await user.type(screen.getByLabelText(/repetir nueva contraseña/i), "otraclave99");
    await user.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("valores válidos → llama a onSubmit con passwordNueva y repetirPassword", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RestablecerPasswordForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/^nueva contraseña$/i), "nueva12345");
    await user.type(screen.getByLabelText(/repetir nueva contraseña/i), "nueva12345");
    await user.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { passwordNueva: "nueva12345", repetirPassword: "nueva12345" },
        expect.anything(),
      ),
    );
  });
});
