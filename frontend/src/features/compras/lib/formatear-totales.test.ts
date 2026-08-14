import { describe, it, expect } from "vitest";
import { formatearTotalesPorMoneda } from "./formatear-totales";

/**
 * `formatearTotalesPorMoneda` es la única lógica no trivial de la columna
 * "Totales por moneda": el caso vacío (compra sin ítems aprobados/cargados
 * todavía) y el multi-moneda son los edge cases reales — el resto es
 * `Intl.NumberFormat` estándar.
 */
describe("formatearTotalesPorMoneda", () => {
  it("objeto vacío (compra sin ítems no eliminados) -> '—'", () => {
    expect(formatearTotalesPorMoneda({})).toBe("—");
  });

  it("una sola moneda formatea con separador es-AR (miles '.', decimales ',')", () => {
    expect(formatearTotalesPorMoneda({ ARS: 1234.5 })).toBe("ARS 1.234,50");
  });

  it("múltiples monedas se listan todas, separadas por '·'", () => {
    expect(formatearTotalesPorMoneda({ ARS: 1000, USD: 250.75 })).toBe("ARS 1.000,00 · USD 250,75");
  });
});
