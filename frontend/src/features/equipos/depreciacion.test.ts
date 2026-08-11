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
});
