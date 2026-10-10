import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoMotivo, MENSAJE_SSO_ERROR } from "./AvisoMotivo";

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

  // Spec: sdd/login-sso — SL13.
  it("motivo=sso-error → alerta con el mensaje genérico único", () => {
    currentSearch = "motivo=sso-error";
    render(<AvisoMotivo />);

    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_SSO_ERROR);
  });

  it("el mensaje de falla del SSO no revela el motivo ni cambia con parámetros extra", () => {
    currentSearch = "motivo=sso-error&razon=root&detalle=usuario-inactivo";
    render(<AvisoMotivo />);

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(MENSAJE_SSO_ERROR);
    expect(alerta).not.toHaveTextContent(/root|inactivo/i);
  });
});
