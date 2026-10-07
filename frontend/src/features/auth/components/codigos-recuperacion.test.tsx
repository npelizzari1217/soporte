import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodigosRecuperacion } from "./codigos-recuperacion";

// Spec: sdd/verificacion-dos-pasos — T5, L5.

const CODIGOS = Array.from({ length: 10 }, (_, i) => `CODE-000${i}-ABCD`);

describe("CodigosRecuperacion", () => {
  it("lista los 10 códigos", () => {
    render(<CodigosRecuperacion codigos={CODIGOS} onContinuar={vi.fn()} isLoading={false} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("Continuar queda deshabilitado hasta marcar 'Los guardé'", async () => {
    const onContinuar = vi.fn();
    const user = userEvent.setup();
    render(<CodigosRecuperacion codigos={CODIGOS} onContinuar={onContinuar} isLoading={false} />);
    const boton = screen.getByRole("button", { name: /continuar/i });
    expect(boton).toBeDisabled();
    await user.click(screen.getByLabelText(/los guardé/i));
    expect(boton).toBeEnabled();
    await user.click(boton);
    expect(onContinuar).toHaveBeenCalledTimes(1);
  });

  it("Copiar códigos escribe todos en el portapapeles, uno por línea", async () => {
    const user = userEvent.setup();
    render(<CodigosRecuperacion codigos={CODIGOS} onContinuar={vi.fn()} isLoading={false} />);
    const escribir = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: /copiar códigos/i }));
    expect(escribir).toHaveBeenCalledWith(CODIGOS.join("\n"));
    expect(await screen.findByRole("button", { name: /copiados/i })).toBeInTheDocument();
  });
});
