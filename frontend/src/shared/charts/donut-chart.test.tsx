import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutChart } from "./donut-chart";
import { computeDonutSegments } from "./donut-chart";

const data = [
  { label: "Incidente", value: 30 },
  { label: "Solicitud", value: 10 },
];

describe("computeDonutSegments (pure)", () => {
  it("2 categories 30/10 → percentages are 75% and 25% of the total", () => {
    const segments = computeDonutSegments(data);
    expect(segments[0].percentage).toBeCloseTo(75);
    expect(segments[1].percentage).toBeCloseTo(25);
  });

  it("segments' cumulative offsets never overlap (each starts where the previous ended)", () => {
    const segments = computeDonutSegments(data);
    expect(segments[1].startOffset).toBeCloseTo(segments[0].startOffset + segments[0].percentage);
  });

  it("all-zero data → returns segments with 0% each, no NaN/division by zero", () => {
    const segments = computeDonutSegments([{ label: "A", value: 0 }, { label: "B", value: 0 }]);
    expect(segments.every((s) => Number.isFinite(s.percentage))).toBe(true);
    expect(segments[0].percentage).toBe(0);
  });
});

describe("DonutChart", () => {
  it("renders an accessible figure with the given title", () => {
    render(<DonutChart data={data} title="Distribución por tipo" />);
    expect(screen.getByRole("img", { name: "Distribución por tipo" })).toBeInTheDocument();
  });

  it("renders exactly one <circle> segment per category", () => {
    const { container } = render(<DonutChart data={data} title="Distribución" />);
    expect(container.querySelectorAll("circle[data-testid='donut-segment']")).toHaveLength(2);
  });

  it("includes a screen-reader-only fallback table with one row per category", () => {
    render(<DonutChart data={data} title="Distribución" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table).toHaveTextContent("Incidente");
  });
});
