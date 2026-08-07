import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableSkeleton, CardKpiSkeleton, DetailSkeleton } from "./skeletons";

describe("TableSkeleton", () => {
  it("rows=3 → renders exactly 3 skeleton rows", () => {
    render(<TableSkeleton rows={3} />);
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
  });

  it("rows=5 (different value) → renders exactly 5 rows (proves rows drives the count, not hardcoded)", () => {
    render(<TableSkeleton rows={5} />);
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(5);
  });

  it("has aria-busy so assistive tech knows content is loading", () => {
    render(<TableSkeleton rows={2} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

describe("CardKpiSkeleton", () => {
  it("count=4 → renders exactly 4 KPI card skeletons", () => {
    render(<CardKpiSkeleton count={4} />);
    expect(screen.getAllByTestId("kpi-skeleton")).toHaveLength(4);
  });
});

describe("DetailSkeleton", () => {
  it("renders a status region for screen readers", () => {
    render(<DetailSkeleton />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
