import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

// Spec: PR11 — LoginForm: react-hook-form + zod, submit válido llama onSubmit,
// submit inválido bloquea el envío y muestra errores inline.
// Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
// flujo completo de self-service", escenario "El login enlaza a la solicitud
// de reset".

describe("LoginForm", () => {
  it("muestra un link '¿Olvidó su contraseña?' hacia /olvide-password", () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading={false} />);

    expect(screen.getByRole("link", { name: /olvidó su contraseña/i })).toHaveAttribute(
      "href",
      "/olvide-password",
    );
  });

  it("valid email + password → calls onSubmit with the trimmed form values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      email: "user@example.com",
      password: "secret123",
    });
  });

  it("invalid email → does NOT call onSubmit, shows an inline validation error", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/contraseña/i), "secret123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/email válido/i);
  });

  it("isLoading=true → disables both inputs and the submit button", () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/contraseña/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeDisabled();
  });

  it("el botón del ojo alterna la clave entre oculta y visible sin perder lo tipeado", async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} isLoading={false} />);
    const password = screen.getByLabelText("Contraseña");
    await user.type(password, "secret123");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar la clave" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret123");

    await user.click(screen.getByRole("button", { name: "Ocultar la clave" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("el botón del ojo no envía el formulario", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} isLoading={false} />);
    await user.click(screen.getByRole("button", { name: "Mostrar la clave" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
