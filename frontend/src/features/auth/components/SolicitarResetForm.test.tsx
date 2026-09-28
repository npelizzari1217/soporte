import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SolicitarResetForm } from "./SolicitarResetForm";

// Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
// flujo completo de self-service", escenario "La solicitud muestra el mismo
// mensaje siempre".

describe("SolicitarResetForm", () => {
  it("email inválido → error de validación local, no llama a onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SolicitarResetForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/email/i), "no-es-un-email");
    await user.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(await screen.findByText(/email válido/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("email válido → llama a onSubmit con el email", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SolicitarResetForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/email/i), "usuario@example.com");
    await user.click(screen.getByRole("button", { name: /enviar link/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: "usuario@example.com" }, expect.anything()),
    );
  });

  it("isLoading=true → deshabilita el input y el botón", () => {
    render(<SolicitarResetForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeDisabled();
  });
});
