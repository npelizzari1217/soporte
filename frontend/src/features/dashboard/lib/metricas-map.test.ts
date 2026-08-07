import { describe, it, expect } from "vitest";
import {
  toAbiertosCerradosChartData,
  toTiempoPromedioChartData,
  toCargaPorAgenteChartData,
  toDistribucionChartData,
  toSlaPercentage,
} from "./metricas-map";

describe("toAbiertosCerradosChartData", () => {
  it("mapea abiertos/cerrados a dos categorías del chart, en ese orden", () => {
    expect(toAbiertosCerradosChartData({ abiertos: 5, cerrados: 3 })).toEqual([
      { label: "Abiertos", value: 5 },
      { label: "Cerrados", value: 3 },
    ]);
  });
});

describe("toTiempoPromedioChartData", () => {
  it("con horas → un único punto con el valor", () => {
    expect(toTiempoPromedioChartData(36)).toEqual([{ label: "Promedio (h)", value: 36 }]);
  });

  it("null (sin cerrados con SLA aplicable) → array vacío, NO un punto en 0 (evita falsear el dato)", () => {
    expect(toTiempoPromedioChartData(null)).toEqual([]);
  });
});

describe("toCargaPorAgenteChartData", () => {
  const usuarioNombreMap = new Map([["u1", "Ana Gómez"]]);

  it("resuelve asignadoId → nombre completo vía el map de usuarios", () => {
    expect(toCargaPorAgenteChartData([{ asignadoId: "u1", abiertos: 4 }], usuarioNombreMap)).toEqual([
      { label: "Ana Gómez", value: 4 },
    ]);
  });

  it("asignadoId sin match en el map (usuario dado de baja/fuera de scope) → fallback al id crudo, no rompe", () => {
    expect(toCargaPorAgenteChartData([{ asignadoId: "u-desconocido", abiertos: 1 }], usuarioNombreMap)).toEqual([
      { label: "u-desconocido", value: 1 },
    ]);
  });
});

describe("toDistribucionChartData", () => {
  const nombreMap = new Map([["ti1", "Soporte"]]);

  it("resuelve el id de categoría → nombre vía el map de catálogo", () => {
    expect(
      toDistribucionChartData([{ tipoId: "ti1", total: 7 }], (d) => d.tipoId, nombreMap),
    ).toEqual([{ label: "Soporte", value: 7 }]);
  });

  it("id sin match en el catálogo → fallback al id crudo", () => {
    expect(
      toDistribucionChartData([{ tipoId: "ti-desconocido", total: 2 }], (d) => d.tipoId, nombreMap),
    ).toEqual([{ label: "ti-desconocido", value: 2 }]);
  });
});

describe("toSlaPercentage", () => {
  it("convierte la fracción 0..1 del backend a puntos porcentuales 0..100, redondeado", () => {
    expect(toSlaPercentage({ cerradosConSla: 3, cerradosATiempo: 2, porcentaje: 2 / 3 })).toBe(67);
  });

  it("porcentaje=null (cerradosConSla=0, evita división por cero) → 0, NO NaN", () => {
    expect(toSlaPercentage({ cerradosConSla: 0, cerradosATiempo: 0, porcentaje: null })).toBe(0);
  });
});
