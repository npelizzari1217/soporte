import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BotonesSso } from "./botones-sso";

// Spec: sdd/login-sso — SC4, SC5.

describe("BotonesSso", () => {
  it("un enlace por proveedor, con navegación completa hacia el inicio del flujo", () => {
    render(<BotonesSso proveedores={["google", "microsoft"]} siguiente={null} />);

    expect(screen.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
      "href",
      "/api/auth/sso/google/iniciar",
    );
    expect(screen.getByRole("link", { name: "Continuar con Microsoft" })).toHaveAttribute(
      "href",
      "/api/auth/sso/microsoft/iniciar",
    );
  });

  it("un solo proveedor → únicamente su enlace", () => {
    render(<BotonesSso proveedores={["google"]} siguiente={null} />);

    expect(screen.getByRole("link", { name: "Continuar con Google" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /microsoft/i })).not.toBeInTheDocument();
  });

  it("lista vacía → no renderiza nada", () => {
    const { container } = render(<BotonesSso proveedores={[]} siguiente={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("pasa `siguiente` codificado en la query del enlace", () => {
    render(<BotonesSso proveedores={["google"]} siguiente="/pedido-qr?x=1&y=2" />);

    expect(screen.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute(
      "href",
      "/api/auth/sso/google/iniciar?siguiente=%2Fpedido-qr%3Fx%3D1%26y%3D2",
    );
  });

  it("no ofrece controles de vincular ni de desvincular", () => {
    render(<BotonesSso proveedores={["google", "microsoft"]} siguiente={null} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/vincular|desvincular/i)).not.toBeInTheDocument();
  });
});
