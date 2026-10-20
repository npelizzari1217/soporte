import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PriorityBadge } from "./priority-badge";

describe("PriorityBadge", () => {
  it("known code 'CRITICA' → renders capitalized label 'Crítica'", () => {
    render(<PriorityBadge prioridad="CRITICA" />);
    expect(screen.getByText("Crítica")).toBeInTheDocument();
  });

  it("known code 'baja' (lowercase, as backend might send it) → still maps to 'Baja'", () => {
    render(<PriorityBadge prioridad="baja" />);
    expect(screen.getByText("Baja")).toBeInTheDocument();
  });

  it("unknown/tenant-custom code → falls back to rendering the raw code, not empty", () => {
    render(<PriorityBadge prioridad="URGENTE_VIP" />);
    expect(screen.getByText("URGENTE_VIP")).toBeInTheDocument();
  });

  it("each known priority gets its own color, and unknown codes a neutral one", () => {
    const fondo = (codigo: string) => {
      const { unmount } = render(<PriorityBadge prioridad={codigo} />);
      const clases = screen.getByTestId("priority-badge").className;
      unmount();
      return clases.match(/(?:^| )bg-(\w+)-/)?.[1] ?? "neutra";
    };
    const fondos = ["BAJA", "MEDIA", "ALTA", "OTRA"].map(fondo);
    expect(new Set(fondos).size).toBe(4);
    expect(fondo("OTRA")).toBe("neutra");
  });
});
