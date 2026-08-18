import { describe, it, expect } from "vitest";
import { formatearNumeroEsAr, formatearMontoConMoneda, parsearNumeroEsAr } from "./formato-numero";

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
});
