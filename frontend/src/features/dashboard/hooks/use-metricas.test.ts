import { describe, it, expect } from "vitest";
import { buildMetricasPath } from "./use-metricas";

describe("buildMetricasPath", () => {
  it("sin cicloId → path base, sin query string (el backend resuelve el ciclo ACTIVO)", () => {
    expect(buildMetricasPath(undefined)).toBe("dashboard/metricas");
  });

  it("con cicloId → agrega ?ciclo=<id> (ciclo explícito, histórico)", () => {
    expect(buildMetricasPath("c1")).toBe("dashboard/metricas?ciclo=c1");
  });
});
