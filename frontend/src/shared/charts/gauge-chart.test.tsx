import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GaugeChart } from "./gauge-chart";

describe("GaugeChart", () => {
  it("value=75 → the accessible label mentions '75%'", () => {
    render(<GaugeChart value={75} title="% SLA cumplido" />);
    expect(screen.getByRole("img", { name: /75%/ })).toBeInTheDocument();
  });

  it("value=0 vs value=100 → the foreground arc's strokeDasharray differs (proves value drives the arc)", () => {
    const low = render(<GaugeChart value={0} title="SLA" />);
    const lowArc = low.container.querySelector("path[data-testid='gauge-fg']");
    const lowDash = lowArc?.getAttribute("stroke-dasharray");
    low.unmount();

    const high = render(<GaugeChart value={100} title="SLA" />);
    const highArc = high.container.querySelector("path[data-testid='gauge-fg']");
    const highDash = highArc?.getAttribute("stroke-dasharray");

    expect(highDash).not.toBe(lowDash);
  });

  it("renders a visible numeric label with the percentage value", () => {
    render(<GaugeChart value={42} title="SLA" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});
