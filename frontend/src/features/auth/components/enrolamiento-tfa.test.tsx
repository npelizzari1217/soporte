import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnrolamientoTfa } from "./enrolamiento-tfa";

// Spec: sdd/verificacion-dos-pasos — T4, L5.

const DATOS = { otpauthUri: "otpauth://totp/Soporte:u?secret=JBSWY3DPEHPK3PXP", claveManual: "JBSW Y3DP EHPK 3PXP" };

describe("EnrolamientoTfa", () => {
  it("muestra el QR con nombre accesible y la clave manual", () => {
    render(<EnrolamientoTfa datos={DATOS} onConfirmar={vi.fn()} isLoading={false} />);
    expect(screen.getByRole("img", { name: /qr/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/cargá esta clave/i)).toHaveValue(DATOS.claveManual);
  });

  it("sin datos todavía avisa que está preparando y no muestra el formulario", () => {
    render(<EnrolamientoTfa datos={null} onConfirmar={vi.fn()} isLoading={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(/preparando/i);
    expect(screen.queryByRole("button", { name: /activar/i })).not.toBeInTheDocument();
  });

  it("un código que no son 6 dígitos no avanza", async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();
    render(<EnrolamientoTfa datos={DATOS} onConfirmar={onConfirmar} isLoading={false} />);
    await user.type(screen.getByLabelText(/código de verificación/i), "12ab");
    await user.click(screen.getByRole("button", { name: /activar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/6 dígitos/i);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("un código de 6 dígitos se confirma", async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();
    render(<EnrolamientoTfa datos={DATOS} onConfirmar={onConfirmar} isLoading={false} />);
    await user.type(screen.getByLabelText(/código de verificación/i), "123456");
    await user.click(screen.getByRole("button", { name: /activar/i }));
    expect(onConfirmar).toHaveBeenCalledWith("123456");
  });
});
