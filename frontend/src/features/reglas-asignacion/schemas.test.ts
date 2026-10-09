import { describe, it, expect } from "vitest";
import {
  ESTADOS_REGLA_ASIGNACION,
  configurarReglaBodySchema,
  reglaAsignacionFilaSchema,
  reglasAsignacionVistaSchema,
} from "./schemas";

/** Espejo de `ReglaAsignacionFila` / `CandidatoRegla` del backend (R6). */
const FILA = {
  tipoId: "t-1",
  codigo: "INC",
  nombre: "Incidente",
  modulo: "SOPORTE",
  responsableId: null,
  responsableNombre: null,
  estado: "SIN_REGLA",
};

describe("schemas de reglas de asignación", () => {
  it("espeja los tres estados del backend", () => {
    expect([...ESTADOS_REGLA_ASIGNACION]).toEqual(["SIN_REGLA", "VALIDA", "ROTA"]);
  });

  it("acepta la vista completa con filas y candidatos por módulo", () => {
    const vista = {
      reglas: [FILA],
      candidatosPorModulo: { SOPORTE: [{ id: "u-1", nombre: "Ana", apellido: "Gómez" }] },
    };
    expect(reglasAsignacionVistaSchema.safeParse(vista).success).toBe(true);
  });

  it("rechaza un estado que el backend no emite", () => {
    expect(reglaAsignacionFilaSchema.safeParse({ ...FILA, estado: "OTRO" }).success).toBe(false);
  });

  it("rechaza una fila sin módulo", () => {
    expect(reglaAsignacionFilaSchema.safeParse({ ...FILA, modulo: undefined }).success).toBe(false);
  });

  it("el body acepta un UUID y null (quitar la regla), y rechaza texto libre", () => {
    expect(configurarReglaBodySchema.safeParse({ responsableId: null }).success).toBe(true);
    expect(
      configurarReglaBodySchema.safeParse({ responsableId: "3f0c2b6e-8a51-4d6e-9c52-1b7f4f3e2a10" }).success,
    ).toBe(true);
    expect(configurarReglaBodySchema.safeParse({ responsableId: "ana" }).success).toBe(false);
  });
});
