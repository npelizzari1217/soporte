import { describe, it, expect } from "vitest";
import { formatearCantidadEsAr } from "./formato-cantidad";

describe("formatearCantidadEsAr", () => {
  it("unidad entera con valor entero sale sin decimales", () => {
    expect(formatearCantidadEsAr(3, true)).toBe("3");
  });

  it("unidad fraccionaria siempre lleva dos decimales con coma", () => {
    expect(formatearCantidadEsAr(2.5, false)).toBe("2,50");
    expect(formatearCantidadEsAr(3, false)).toBe("3,00");
  });

  it("un fraccionario en unidad entera no se redondea a entero", () => {
    expect(formatearCantidadEsAr(2.5, true)).toBe("2,50");
  });

  it("los negativos salen como números", () => {
    expect(formatearCantidadEsAr(-3, true)).toBe("-3");
    expect(formatearCantidadEsAr(-2.5, false)).toBe("-2,50");
  });

  it("-0 sale como 0", () => {
    expect(formatearCantidadEsAr(-0, true)).toBe("0");
    expect(formatearCantidadEsAr(-0, false)).toBe("0,00");
  });
});
