import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge, etiquetaOpcionEstado } from "./status-badge";

describe("StatusBadge", () => {
  it("NUEVO → renders the reinforced label '✨ Nuevo!!'", () => {
    render(<StatusBadge estado="NUEVO" />);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("✨ Nuevo!!");
  });

  it("RESUELTO → renders label 'Resuelto'", () => {
    render(<StatusBadge estado="RESUELTO" />);
    expect(screen.getByText("Resuelto")).toBeInTheDocument();
  });

  it("CANCELADO → renders label 'Cancelado', distinct from CERRADO", () => {
    render(<StatusBadge estado="CANCELADO" />);
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByText("Cerrado")).not.toBeInTheDocument();
  });

  it("ESPERANDO_CLIENTE → renders label 'Esperando al cliente'", () => {
    render(<StatusBadge estado="ESPERANDO_CLIENTE" />);
    expect(screen.getByText("Esperando al cliente")).toBeInTheDocument();
  });

  it("every workflow estado maps to a NON-EMPTY, DISTINCT label (no silent fallback)", () => {
    const estados = ["NUEVO", "ASIGNADO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO", "CANCELADO"] as const;
    const labels = estados.map((estado) => {
      const { unmount } = render(<StatusBadge estado={estado} />);
      const el = screen.getByTestId("status-badge");
      const text = el.textContent;
      unmount();
      return text;
    });
    expect(new Set(labels).size).toBe(estados.length);
  });

  it("every workflow estado carries its own color class, with a dark-mode pair", () => {
    const estados = ["NUEVO", "ASIGNADO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO", "CANCELADO"] as const;
    const fondos = estados.map((estado) => {
      const { unmount } = render(<StatusBadge estado={estado} />);
      const clases = screen.getByTestId("status-badge").className;
      unmount();
      expect(clases).toMatch(/dark:bg-/);
      return clases.match(/(?:^| )bg-(\w+)-/)?.[1];
    });
    expect(new Set(fondos).size).toBe(estados.length);
  });
});

describe("etiquetaOpcionEstado", () => {
  it("prefixes the color emoji to known estados", () => {
    expect(etiquetaOpcionEstado("NUEVO")).toBe("🔵 Nuevo");
    expect(etiquetaOpcionEstado("CANCELADO")).toBe("🔴 Cancelado");
  });

  it("falls back to the given text for an unknown code", () => {
    expect(etiquetaOpcionEstado("OTRO", "Otro estado")).toBe("Otro estado");
  });
});
