import { describe, it, expect } from "vitest";
import { admiteAltaManual, puedeAltaManualEnAlgunModulo } from "./alta-manual";

describe("admiteAltaManual (odd/ticket-unificado, S2, S6)", () => {
  it.each([
    ["un tipo de TICKETS", { codigo: "SOPORTE", modulo: "TICKETS" }, true],
    ["un tipo de EDILICIA", { codigo: "MANTENIMIENTO", modulo: "EDILICIA" }, true],
    ["PREVENTIVO, que lo genera solo el barrido", { codigo: "PREVENTIVO", modulo: "EDILICIA" }, false],
    ["un tipo de COMPRAS, que tiene su alta propia", { codigo: "COMPRA", modulo: "COMPRAS" }, false],
    ["un tipo de EQUIPOS", { codigo: "EQUIPO", modulo: "EQUIPOS" }, false],
  ])("%s → %s", (_caso, tipo, esperado) => {
    expect(admiteAltaManual(tipo)).toBe(esperado);
  });
});

describe("puedeAltaManualEnAlgunModulo", () => {
  it("con ALTAS en un módulo con alta de tipo, sí; con ALTAS solo en otro módulo, no", () => {
    const conAltas = (modulos: string[]) => (modulo: string, accion: string) =>
      accion === "ALTAS" && modulos.includes(modulo);

    expect(puedeAltaManualEnAlgunModulo(conAltas(["TICKETS"]))).toBe(true);
    expect(puedeAltaManualEnAlgunModulo(conAltas(["EDILICIA"]))).toBe(true);
    expect(puedeAltaManualEnAlgunModulo(conAltas(["COMPRAS", "EQUIPOS"]))).toBe(false);
    expect(puedeAltaManualEnAlgunModulo(conAltas([]))).toBe(false);
  });
});
