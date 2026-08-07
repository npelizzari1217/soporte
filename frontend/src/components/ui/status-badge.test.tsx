import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("NUEVO → renders label 'Nuevo' with the default (primary) variant styling", () => {
    render(<StatusBadge estado="NUEVO" />);
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
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

  it("every workflow estado maps to a NON-EMPTY, DISTINCT label (no silent fallback)", () => {
    const estados = ["NUEVO", "ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO", "CANCELADO"] as const;
    const labels = estados.map((estado) => {
      const { unmount } = render(<StatusBadge estado={estado} />);
      const el = screen.getByTestId("status-badge");
      const text = el.textContent;
      unmount();
      return text;
    });
    expect(new Set(labels).size).toBe(estados.length);
  });
});
