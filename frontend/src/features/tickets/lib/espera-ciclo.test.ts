import { describe, it, expect } from "vitest";
import { debeEsperarCicloDeLaUrl } from "./espera-ciclo";

/**
 * Cuándo el listado de tickets posterga su pedido hasta conocer el ciclo de la URL
 * (odd/autor-y-filtro-fechas, S2): solo mientras corre el PRIMER intento de `GET /ciclos`.
 */
describe("debeEsperarCicloDeLaUrl", () => {
  const cargando = { isPending: true, failureCount: 0 };

  it("con ciclo en la URL, sin fechas y los ciclos en el primer intento: espera", () => {
    expect(debeEsperarCicloDeLaUrl({ ciclo: "c-2024" }, cargando)).toBe(true);
  });

  it("con una sola fecha en la URL tambi\u00e9n espera: la otra sale del ciclo", () => {
    expect(debeEsperarCicloDeLaUrl({ ciclo: "c-2024", fechaDesde: "2024-03-01" }, cargando)).toBe(true);
    expect(debeEsperarCicloDeLaUrl({ ciclo: "c-2024", fechaHasta: "2024-06-30" }, cargando)).toBe(true);
  });

  it("si el primer intento fall\u00f3 y react-query reintenta, no espera el reintento", () => {
    expect(debeEsperarCicloDeLaUrl({ ciclo: "c-2024" }, { isPending: true, failureCount: 1 })).toBe(false);
  });

  it("no espera sin ciclo, con las dos fechas o con los ciclos ya resueltos", () => {
    expect(debeEsperarCicloDeLaUrl({}, cargando)).toBe(false);
    expect(
      debeEsperarCicloDeLaUrl({ ciclo: "c-2024", fechaDesde: "2024-01-01", fechaHasta: "2024-12-31" }, cargando),
    ).toBe(false);
    expect(debeEsperarCicloDeLaUrl({ ciclo: "c-2024" }, { isPending: false, failureCount: 0 })).toBe(false);
  });
});
