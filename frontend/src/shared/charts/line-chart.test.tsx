import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LineChart } from "./line-chart";

const data = [
  { label: "Ene", value: 3 },
  { label: "Feb", value: 5 },
  { label: "Mar", value: 1 },
];

describe("LineChart", () => {
  it("renders an accessible figure with the given title", () => {
    render(<LineChart data={data} title="Tiempo promedio de resolución" />);
    expect(screen.getByRole("img", { name: "Tiempo promedio de resolución" })).toBeInTheDocument();
  });

  it("renders a single <polyline> whose points count matches the data length", () => {
    const { container } = render(<LineChart data={data} title="Trend" />);
    const line = container.querySelector("polyline[data-testid='line-path']");
    expect(line).not.toBeNull();
    const points = line?.getAttribute("points")?.trim().split(/\s+/) ?? [];
    expect(points).toHaveLength(3);
  });

  it("area=true → also renders a filled <polygon> area beneath the line", () => {
    const { container } = render(<LineChart data={data} title="Trend" area />);
    expect(container.querySelector("polygon[data-testid='line-area']")).not.toBeNull();
  });

  it("area not set (default false) → does NOT render the area polygon", () => {
    const { container } = render(<LineChart data={data} title="Trend" />);
    expect(container.querySelector("polygon[data-testid='line-area']")).toBeNull();
  });

  it("includes a screen-reader-only fallback table with one row per data point", () => {
    render(<LineChart data={data} title="Trend" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
  });
});
