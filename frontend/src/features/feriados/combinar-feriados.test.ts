import { describe, it, expect } from "vitest";
import { combinarFeriados } from "./combinar-feriados";

const GLOBAL_ENERO = { id: "g1", fecha: "2026-01-01", descripcion: "Año Nuevo" };
const GLOBAL_MAYO = { id: "g2", fecha: "2026-05-01", descripcion: "Día del Trabajador" };
const CLIENTE_MARZO = { id: "c1", fecha: "2026-03-15", descripcion: "Aniversario del cliente" };
const CLIENTE_DICIEMBRE = { id: "c2", fecha: "2026-12-08", descripcion: "Cierre anual" };

describe("combinarFeriados (task 8.1, WU8a)", () => {
  it("ambas listas vacías → devuelve un array vacío", () => {
    expect(combinarFeriados([], [])).toEqual([]);
  });

  it("solo globales, sin propios → todas las filas quedan con origen GLOBAL", () => {
    const filas = combinarFeriados([GLOBAL_ENERO, GLOBAL_MAYO], []);
    expect(filas).toHaveLength(2);
    expect(filas.every((fila) => fila.origen === "GLOBAL")).toBe(true);
  });

  it("solo propios, sin globales → todas las filas quedan con origen CLIENTE", () => {
    const filas = combinarFeriados([], [CLIENTE_MARZO, CLIENTE_DICIEMBRE]);
    expect(filas).toHaveLength(2);
    expect(filas.every((fila) => fila.origen === "CLIENTE")).toBe(true);
  });

  it("fechas intercaladas entre origen GLOBAL y CLIENTE quedan ordenadas por fecha ascendente", () => {
    // A propósito en orden de entrada NO cronológico en ninguna de las dos
    // listas, para probar que el merge ordena y no solo concatena.
    const filas = combinarFeriados([GLOBAL_MAYO, GLOBAL_ENERO], [CLIENTE_DICIEMBRE, CLIENTE_MARZO]);

    expect(filas.map((fila) => fila.fecha)).toEqual([
      "2026-01-01",
      "2026-03-15",
      "2026-05-01",
      "2026-12-08",
    ]);
    expect(filas.map((fila) => fila.origen)).toEqual(["GLOBAL", "CLIENTE", "GLOBAL", "CLIENTE"]);
  });

  it("cada fila conserva id/fecha/descripción sin mutar el objeto original", () => {
    const [fila] = combinarFeriados([GLOBAL_ENERO], []);
    expect(fila).toEqual({ ...GLOBAL_ENERO, origen: "GLOBAL" });
    expect(GLOBAL_ENERO).not.toHaveProperty("origen");
  });
});
