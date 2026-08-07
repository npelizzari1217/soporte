import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HBarChart } from "./hbar-chart";

const data = [
  { label: "Ana", value: 12 },
  { label: "Beto", value: 4 },
];

describe("HBarChart", () => {
  it("renders an accessible figure with the given title", () => {
    render(<HBarChart data={data} title="Carga por agente" />);
    expect(screen.getByRole("img", { name: "Carga por agente" })).toBeInTheDocument();
  });

  it("renders exactly one horizontal <rect> bar per agent", () => {
    const { container } = render(<HBarChart data={data} title="Carga" />);
    expect(container.querySelectorAll("rect[data-testid='hbar']")).toHaveLength(2);
  });

  it("the bar for the higher value (12) is WIDER than the bar for the lower value (4)", () => {
    const { container } = render(<HBarChart data={data} title="Carga" />);
    const bars = Array.from(container.querySelectorAll("rect[data-testid='hbar']"));
    const widths = bars.map((b) => Number(b.getAttribute("width")));
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it("includes a screen-reader-only fallback table with one row per agent", () => {
    render(<HBarChart data={data} title="Carga" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table).toHaveTextContent("Ana");
  });
});
