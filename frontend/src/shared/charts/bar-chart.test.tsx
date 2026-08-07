import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./bar-chart";

const data = [
  { label: "Lun", value: 4 },
  { label: "Mar", value: 9 },
  { label: "Mié", value: 2 },
];

describe("BarChart", () => {
  it("renders an accessible figure with the given title as aria-label", () => {
    render(<BarChart data={data} title="Tickets abiertos por día" />);
    expect(screen.getByRole("img", { name: "Tickets abiertos por día" })).toBeInTheDocument();
  });

  it("renders exactly one <rect> bar per data point", () => {
    const { container } = render(<BarChart data={data} title="Tickets" />);
    expect(container.querySelectorAll("rect[data-testid='bar']")).toHaveLength(3);
  });

  it("the tallest bar (value=9) has a GREATER height than the shortest (value=2)", () => {
    const { container } = render(<BarChart data={data} title="Tickets" />);
    const bars = Array.from(container.querySelectorAll("rect[data-testid='bar']"));
    const heights = bars.map((b) => Number(b.getAttribute("height")));
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  it("includes a screen-reader-only fallback table with one row per data point", () => {
    render(<BarChart data={data} title="Tickets" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table).toHaveTextContent("Mar");
    expect(table).toHaveTextContent("9");
  });
});
