import { describe, it, expect } from "vitest";
import {
  toAbiertosCerradosChartData,
  toTiempoPromedioChartData,
  toCargaPorAgenteChartData,
  toDistribucionChartData,
  formatHoras,
  toPorcentaje,
  toTareasCompletadasChartData,
  toCumplimientoTecnicoFilas,
  NOMBRE_USUARIO_AUSENTE,
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

describe("toTareasCompletadasChartData", () => {
  it("arma el nombre completo y respeta el orden del backend", () => {
    expect(
      toTareasCompletadasChartData([
        { usuarioId: "u2", nombre: "Beto", apellido: "Ruiz", completadas: 5 },
        { usuarioId: "u1", nombre: "Ana", apellido: "Gómez", completadas: 2 },
      ]),
    ).toEqual([
      { label: "Beto Ruiz", value: 5 },
      { label: "Ana Gómez", value: 2 },
    ]);
  });

  it("usuario ausente de master (nombre y apellido null) → etiqueta neutra 'Usuario'", () => {
    expect(
      toTareasCompletadasChartData([{ usuarioId: "u-baja", nombre: null, apellido: null, completadas: 3 }]),
    ).toEqual([{ label: "Usuario", value: 3 }]);
  });

  it("con solo una de las dos partes del nombre, usa la que hay", () => {
    expect(
      toTareasCompletadasChartData([{ usuarioId: "u1", nombre: "Ana", apellido: null, completadas: 1 }]),
    ).toEqual([{ label: "Ana", value: 1 }]);
  });

  it("campo ausente (backend anterior a T4) → array vacío, no rompe", () => {
    expect(toTareasCompletadasChartData(undefined)).toEqual([]);
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

describe("toPorcentaje", () => {
  it("convierte la fracción 0..1 del backend a puntos porcentuales 0..100, redondeado", () => {
    expect(toPorcentaje(2 / 3)).toBe(67);
  });

  it("0 es un valor real (0 %), distinto de sin datos", () => {
    expect(toPorcentaje(0)).toBe(0);
  });

  it("null (sin datos) → null, NO 0 ni NaN", () => {
    expect(toPorcentaje(null)).toBeNull();
  });
});

describe("formatHoras", () => {
  it("un decimal con coma y unidad", () => {
    expect(formatHoras(1.25)).toBe("1,3 h");
    expect(formatHoras(0)).toBe("0,0 h");
  });

  it("null → null", () => {
    expect(formatHoras(null)).toBeNull();
  });
});

describe("toCumplimientoTecnicoFilas", () => {
  it("redondea el % a entero, formatea el promedio en h:mm y conserva el orden del backend", () => {
    expect(
      toCumplimientoTecnicoFilas([
        { usuarioId: "u2", nombre: "Beto", apellido: "Ruiz", total: 3, cumplidos: 2, porcentaje: 2 / 3, promedioHabilS: 7500 },
        { usuarioId: "u1", nombre: "Ana", apellido: null, total: 5, cumplidos: 0, porcentaje: 0, promedioHabilS: 59 },
      ]),
    ).toEqual([
      { usuarioId: "u2", nombre: "Beto Ruiz", evaluados: 3, cumplidos: 2, porcentaje: 67, promedio: "2:05" },
      { usuarioId: "u1", nombre: "Ana", evaluados: 5, cumplidos: 0, porcentaje: 0, promedio: "0:01" },
    ]);
  });

  it("usuario que ya no está en master → etiqueta neutra, no el id", () => {
    const [fila] = toCumplimientoTecnicoFilas([
      { usuarioId: "u-baja", nombre: null, apellido: "  ", total: 1, cumplidos: 1, porcentaje: 1, promedioHabilS: 0 },
    ]);
    expect(fila.nombre).toBe(NOMBRE_USUARIO_AUSENTE);
  });

  it("campo ausente (backend anterior) → lista vacía", () => {
    expect(toCumplimientoTecnicoFilas(undefined)).toEqual([]);
  });
});
