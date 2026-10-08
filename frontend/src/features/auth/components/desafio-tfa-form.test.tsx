import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesafioTfaForm } from "./desafio-tfa-form";

// Spec: sdd/verificacion-dos-pasos — L6 (código o recuperación), D4 (sin casilla: la confianza es automática).

describe("DesafioTfaForm", () => {
  it("un código de 6 dígitos se envía tal cual", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<DesafioTfaForm onSubmit={onSubmit} isLoading={false} />);

    const input = screen.getByLabelText(/código de verificación/i);
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await user.type(input, "123456");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    expect(onSubmit.mock.calls[0][0]).toEqual({ codigo: "123456" });
  });

  it("acepta un código de recuperación XXXX-XXXX-XXXX", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<DesafioTfaForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/código de verificación/i), "ABCD-EFGH-2345");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    expect(onSubmit.mock.calls[0][0]).toEqual({ codigo: "ABCD-EFGH-2345" });
  });

  it("un código inválido no se envía y muestra el error en línea", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<DesafioTfaForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/código de verificación/i), "12ab");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("no ofrece casilla para recordar el dispositivo: la confianza es automática", () => {
    render(<DesafioTfaForm onSubmit={vi.fn()} isLoading={false} />);
    expect(screen.queryByLabelText(/recordar este dispositivo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("mientras envía deshabilita el campo y el botón", () => {
    render(<DesafioTfaForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByLabelText(/código de verificación/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /verificar/i })).toBeDisabled();
  });
});
