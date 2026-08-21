import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoMotivo } from "./AvisoMotivo";

// Spec: sdd/cambio-de-contrasena — WU4, cartel de /login tras cambiar la contraseña.

let currentSearch = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

describe("AvisoMotivo", () => {
  it("motivo=password-cambiada → muestra el mensaje de éxito", () => {
    currentSearch = "motivo=password-cambiada";
    render(<AvisoMotivo />);

    expect(screen.getByText(/cambiaste tu contraseña/i)).toBeInTheDocument();
  });

  it("sin motivo en la URL → no renderiza nada", () => {
    currentSearch = "";
    const { container } = render(<AvisoMotivo />);

    expect(container).toBeEmptyDOMElement();
  });

  it("con un motivo distinto → no renderiza nada", () => {
    currentSearch = "motivo=otra-cosa";
    const { container } = render(<AvisoMotivo />);

    expect(container).toBeEmptyDOMElement();
  });
});
