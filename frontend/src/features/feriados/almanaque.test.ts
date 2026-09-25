import { describe, it, expect } from "vitest";
import { obtenerSemanasDelMes, mesSiguiente, mesAnterior, etiquetaMes } from "./almanaque";

describe("obtenerSemanasDelMes", () => {
  it("June 2026 starts on Monday → no leading cells, 5 weeks", () => {
    const semanas = obtenerSemanasDelMes(2026, 6);
    expect(semanas[0][0]).toMatchObject({ fecha: "2026-06-01", esDelMesActual: true });
    expect(semanas).toHaveLength(5);
  });

  it("March 2026 starts on Sunday → 6 leading cells and 6 weeks total", () => {
    const semanas = obtenerSemanasDelMes(2026, 3);
    expect(semanas[0].map((dia) => dia.fecha)).toEqual([
      "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01",
    ]);
    expect(semanas[0].slice(0, 6).every((dia) => !dia.esDelMesActual)).toBe(true);
    expect(semanas).toHaveLength(6);
    expect(semanas[5].at(-1)).toMatchObject({ fecha: "2026-04-05", esDelMesActual: false });
  });

  it("February 2028 (leap year) has 29 days across 5 weeks", () => {
    const semanas = obtenerSemanasDelMes(2028, 2);
    expect(semanas).toHaveLength(5);
    const diasDelMes = semanas.flat().filter((dia) => dia.esDelMesActual);
    expect(diasDelMes).toHaveLength(29);
    expect(diasDelMes.at(-1)?.fecha).toBe("2028-02-29");
  });

  it("flags Saturday and Sunday as weekend (October 2026)", () => {
    const porFecha = new Map(obtenerSemanasDelMes(2026, 10).flat().map((d) => [d.fecha, d]));
    expect(porFecha.get("2026-10-03")?.esFinDeSemana).toBe(true); // sábado
    expect(porFecha.get("2026-10-06")?.esFinDeSemana).toBe(false); // martes
  });
});

describe("mesSiguiente / mesAnterior", () => {
  it("mesSiguiente carries the year over from December to January", () => {
    expect(mesSiguiente({ anio: 2026, mes: 12 })).toEqual({ anio: 2027, mes: 1 });
  });

  it("mesAnterior carries the year back from January to December", () => {
    expect(mesAnterior({ anio: 2027, mes: 1 })).toEqual({ anio: 2026, mes: 12 });
  });
});

describe("etiquetaMes", () => {
  it("formats the month label in Spanish", () => {
    expect(etiquetaMes(2026, 10)).toBe("Octubre 2026");
  });
});
