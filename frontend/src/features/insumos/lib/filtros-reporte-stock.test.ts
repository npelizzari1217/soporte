import { describe, it, expect } from "vitest";
import {
  parsearFiltrosReporteStock,
  serializarFiltrosReporteStock,
} from "./filtros-reporte-stock";

const FAMILIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("filtros del reporte de stock", () => {
  it("ida y vuelta URL <-> filtros", () => {
    const qs = `familiaId=${FAMILIA}&esRepuesto=true&soloBajoMinimo=true&ocultarSinStock=true`;
    const filtros = parsearFiltrosReporteStock(new URLSearchParams(qs));
    expect(filtros).toEqual({
      familiaId: FAMILIA,
      esRepuesto: true,
      soloBajoMinimo: true,
      ocultarSinStock: true,
    });
    expect(serializarFiltrosReporteStock(filtros)).toBe(qs);
  });

  it("esRepuesto=false se conserva (consumibles) y los otros dos false se omiten", () => {
    const filtros = parsearFiltrosReporteStock(
      new URLSearchParams("esRepuesto=false&soloBajoMinimo=false"),
    );
    expect(serializarFiltrosReporteStock(filtros)).toBe("esRepuesto=false");
  });

  it("descarta los parametros invalidos", () => {
    const filtros = parsearFiltrosReporteStock(
      new URLSearchParams("familiaId=no-uuid&esRepuesto=1&soloBajoMinimo=si&ocultarSinStock="),
    );
    expect(filtros).toEqual({});
    expect(serializarFiltrosReporteStock(filtros)).toBe("");
  });

  it("el orden de claves es estable sin importar el orden de entrada", () => {
    const a = parsearFiltrosReporteStock(
      new URLSearchParams(`ocultarSinStock=true&familiaId=${FAMILIA}`),
    );
    const b = parsearFiltrosReporteStock(
      new URLSearchParams(`familiaId=${FAMILIA}&ocultarSinStock=true`),
    );
    expect(serializarFiltrosReporteStock(a)).toBe(serializarFiltrosReporteStock(b));
    expect(serializarFiltrosReporteStock(a)).toBe(`familiaId=${FAMILIA}&ocultarSinStock=true`);
  });

  it("un solo serializador: el query del export es el de la consulta", () => {
    const filtros = parsearFiltrosReporteStock(new URLSearchParams("soloBajoMinimo=true"));
    expect(serializarFiltrosReporteStock(filtros)).toBe(serializarFiltrosReporteStock({ ...filtros }));
  });
});
