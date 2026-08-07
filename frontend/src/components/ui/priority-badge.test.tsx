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
});
