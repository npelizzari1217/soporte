import { describe, it, expect } from "vitest";
import {
  formatearNumeroEsAr,
  formatearMontoConMoneda,
  parsearNumeroEsAr,
  conDosDecimales,
} from "./formato-numero";

/**
 * Lo único no trivial acá es la IDA Y VUELTA: el input de monto muestra la
 * cadena formateada al salir del campo y tiene que poder volver al número
 * crudo, porque `z.coerce.number()` recibe `NaN` si le llega `"1.234.567,89"`.
 */
describe("formato-numero", () => {
  it.each([
    { valor: 1234567.89, formateado: "1.234.567,89" },
    { valor: 1000000, formateado: "1.000.000,00" },
    { valor: 0.5, formateado: "0,50" },
    { valor: 0, formateado: "0,00" },
  ])("ida y vuelta: $valor ↔ '$formateado'", ({ valor, formateado }) => {
    expect(formatearNumeroEsAr(valor)).toBe(formateado);
    expect(parsearNumeroEsAr(formateado)).toBe(valor);
  });

  it("parsea el valor CRUDO que se tipea (punto decimal, sin separador de miles)", () => {
    expect(parsearNumeroEsAr("1234567.89")).toBe(1234567.89);
  });

  it.each([
    { texto: "", caso: "vacío" },
    { texto: "   ", caso: "sólo espacios" },
    { texto: "abc", caso: "texto no numérico" },
  ])("$caso -> null (nunca NaN ni 0 fantasma)", ({ texto }) => {
    expect(parsearNumeroEsAr(texto)).toBeNull();
  });

  it("formatearMontoConMoneda antepone la moneda al número formateado", () => {
    expect(formatearMontoConMoneda("ARS", 1234.5)).toBe("ARS 1.234,50");
  });

  /**
   * Fija la regla de desambiguación del punto, que el JSDoc de
   * `parsearNumeroEsAr` explica y hasta ahora ningún test sostenía: el punto
   * sólo es separador de miles cuando ADEMÁS hay una coma decimal. Es la única
   * rama de la función donde una edición futura puede invertir el significado
   * en silencio, y `MontoInput` acepta pegado, así que un `"1.234"` pegado
   * llega hasta acá.
   */
  describe("desambiguación del punto", () => {
    it.each([
      { texto: "1.234", esperado: 1.234, caso: "sin coma, el punto es DECIMAL" },
      { texto: "1234.5", esperado: 1234.5, caso: "valor crudo tipeado" },
      { texto: "1.234,56", esperado: 1234.56, caso: "con coma, el punto es MILES" },
      { texto: "1.234.567,89", esperado: 1234567.89, caso: "formateado completo" },
    ])("$caso: $texto -> $esperado", ({ texto, esperado }) => {
      expect(parsearNumeroEsAr(texto)).toBe(esperado);
    });
  });

  describe("conDosDecimales", () => {
    it.each([
      { n: 1000, caso: "entero" },
      { n: 1000.5, caso: "un decimal" },
      { n: 1000.55, caso: "exactamente dos decimales (el límite)" },
      { n: 0, caso: "cero" },
    ])("acepta $caso", ({ n }) => {
      expect(conDosDecimales(n)).toBe(true);
    });

    it("rechaza tres decimales", () => {
      expect(conDosDecimales(1000.555)).toBe(false);
    });

    /**
     * Regresión del defecto que motivó consolidar esta función en `shared`: la
     * copia que vivía en `features/equipos/schemas.ts` había perdido este
     * guard. Era inofensivo porque su único llamador filtraba los no finitos
     * antes, pero una copia sin test es una deriva esperando a que cambie el
     * llamador. Estos tres casos son los que la copia dejaba pasar.
     */
    it.each([
      { n: NaN, caso: "NaN" },
      { n: Infinity, caso: "Infinity" },
      { n: -Infinity, caso: "-Infinity" },
    ])("rechaza $caso (guard de Number.isFinite)", ({ n }) => {
      expect(conDosDecimales(n)).toBe(false);
    });

    /**
     * `String(1e21)` es `"1e+21"`: no tiene punto, así que el conteo de
     * decimales lo daría por válido. Ningún monto ni cantidad real usa
     * notación exponencial, y aceptarla haría pasar un número cuya escala no
     * se puede medir por esta vía.
     */
    it.each([
      { n: 1e21, caso: "exponente positivo" },
      { n: 1e-7, caso: "exponente negativo" },
    ])("rechaza notación exponencial: $caso", ({ n }) => {
      expect(String(n)).toMatch(/e/i);
      expect(conDosDecimales(n)).toBe(false);
    });
  });
});
