import { describe, it, expect } from "vitest";
import { linearScale, niceTicks } from "./scale";

describe("linearScale", () => {
  it("maps the domain minimum to the range minimum", () => {
    const scale = linearScale([0, 100], [0, 200]);
    expect(scale(0)).toBe(0);
  });

  it("maps the domain maximum to the range maximum", () => {
    const scale = linearScale([0, 100], [0, 200]);
    expect(scale(100)).toBe(200);
  });

  it("maps a mid-domain value proportionally (not hardcoded)", () => {
    const scale = linearScale([0, 100], [0, 200]);
    expect(scale(50)).toBe(100);
  });

  it("supports an inverted range (e.g. SVG y-axis, larger value = smaller y)", () => {
    const scale = linearScale([0, 100], [200, 0]);
    expect(scale(0)).toBe(200);
    expect(scale(100)).toBe(0);
    expect(scale(25)).toBe(150);
  });

  it("degenerate domain (min === max) → returns the range minimum without dividing by zero", () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(0);
    expect(Number.isFinite(scale(5))).toBe(true);
  });
});

describe("niceTicks", () => {
  it("[0, 100] with count=5 → returns 5 evenly-spaced ticks including 0 and 100", () => {
    const ticks = niceTicks(0, 100, 5);
    expect(ticks).toEqual([0, 25, 50, 75, 100]);
  });

  it("[0, 10] with count=2 → returns exactly 2 ticks (proves count drives length, not a fixed 5)", () => {
    const ticks = niceTicks(0, 10, 2);
    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(10);
  });

  it("min === max (flat data, e.g. all zero) → returns a single tick, no NaN/Infinity", () => {
    const ticks = niceTicks(0, 0, 5);
    expect(ticks).toEqual([0]);
  });
});
