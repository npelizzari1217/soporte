import { describe, expect, it } from "vitest";
import { baseDepreciacion, calcularValorResidual, parseImporte } from "./depreciacion";

describe("calcularValorResidual", () => {
  it("deriva el residual: $1000 al 30% → $700 (ejemplo del spec)", () => {
    expect(calcularValorResidual(1000, 30)).toBe(700);
  });

  it("0% de depreciación → el residual es igual al importe", () => {
    expect(calcularValorResidual(1500.5, 0)).toBe(1500.5);
  });

  it("redondea a 2 decimales", () => {
    // 99.99 * (1 - 50/100) = 49.995 → redondea a 50.00
    expect(calcularValorResidual(99.99, 50)).toBe(50);
  });

  it("clampa a 0 cuando el % supera 100 (residual no puede ser negativo)", () => {
    expect(calcularValorResidual(1000, 150)).toBe(0);
  });
});

describe("baseDepreciacion (depreciación compuesta)", () => {
  it("primera vez (sin valor residual) → base = importe original", () => {
    expect(baseDepreciacion(1000, null)).toBe(1000);
  });

  it("con valor residual previo → base = ese valor residual (encadena)", () => {
    // Ya se deprecio antes y quedo 900 → la proxima depreciacion se hace sobre 900.
    expect(baseDepreciacion(1000, 900)).toBe(900);
  });

  it("sin importe ni valor residual → null (no se puede calcular)", () => {
    expect(baseDepreciacion(null, null)).toBeNull();
  });

  it("compone: 1000 al 10% → 900, y otro 10% sobre 900 → 810", () => {
    const primera = calcularValorResidual(baseDepreciacion(1000, null)!, 10);
    expect(primera).toBe(900);
    const segunda = calcularValorResidual(baseDepreciacion(1000, primera)!, 10);
    expect(segunda).toBe(810);
  });
});

describe("parseImporte", () => {
  it("parsea número con punto o coma decimal", () => {
    expect(parseImporte("1000.50")).toBe(1000.5);
    expect(parseImporte("1000,50")).toBe(1000.5);
  });

  it("vacío o solo espacios → null (no se envía)", () => {
    expect(parseImporte("")).toBeNull();
    expect(parseImporte("   ")).toBeNull();
    expect(parseImporte(undefined)).toBeNull();
  });

  it("valor no numérico → null", () => {
    expect(parseImporte("abc")).toBeNull();
  });

  /**
   * RED primario (sdd/equipos-parse-importe-miles, Esc. 1.1): antes de este
   * fix, `parseImporte` reemplazaba UNA sola coma sin sacar los puntos de
   * miles, así que "1.234.567,89" quedaba como "1.234.567.89" (varios puntos)
   * y `Number(...)` daba `NaN` → `null`. Ahora delega en `parsearNumeroEsAr`,
   * que sí desambigua miles vs. decimal.
   */
  it("miles con decimales: acepta \"1.234.567,89\" (antes fallaba, Esc. 1.1)", () => {
    expect(parseImporte("1.234.567,89")).toBe(1234567.89);
  });

  /**
   * Esc. 1.2 — sin coma en la cadena, el punto NO se puede desambiguar como
   * separador de miles (regla de `parsearNumeroEsAr`, D3 del design): sigue
   * leyéndose como decimal. `"1.234"` da `1.234`, no `1234`.
   */
  it("miles sin decimales: \"1.234\" se sigue leyendo como decimal (1.234), el punto no es miles sin coma", () => {
    expect(parseImporte("1.234")).toBe(1.234);
  });

  /**
   * Esc. 1.4 — hermano invertido de 1.1/1.2: texto no numérico, o con varios
   * puntos y sin coma que los desambigüe, sigue rechazándose.
   */
  it.each([
    ["abc", "texto no numérico"],
    ["12.34.56", "varios puntos sin coma que los desambigüe"],
  ])("rechaza \"%s\" (%s) → null (Esc. 1.4)", (valor) => {
    expect(parseImporte(valor)).toBeNull();
  });
});
