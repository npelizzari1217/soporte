import { describe, it, expect } from "vitest";
import { crearPlanPreventivoSchema, editarPlanPreventivoSchema } from "./schemas";

/**
 * Validación cliente-side del objetivo excluyente (ADR-PV1). El dominio y el
 * CHECK de Postgres son la autoridad real (backend); este schema mejora el
 * feedback al usuario, no la reemplaza — mismos dos escenarios de rechazo que
 * `plan-preventivo.entity.spec.ts` (WU-3).
 */
function baseValues() {
  return {
    titulo: "Revisión mensual",
    prioridadId: "11111111-1111-1111-1111-111111111111",
    responsableId: "22222222-2222-2222-2222-222222222222",
    intervaloValor: "1",
    intervaloUnidad: "MESES" as const,
    fechaInicio: "2026-01-01",
  };
}

describe("crearPlanPreventivoSchema — objetivo excluyente", () => {
  it("rechaza cuando vienen equipoId Y ubicacion a la vez", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      equipoId: "33333333-3333-3333-3333-333333333333",
      ubicacion: "DEPOSITO",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza cuando no viene ni equipoId ni ubicacion", () => {
    const result = crearPlanPreventivoSchema.safeParse(baseValues());
    expect(result.success).toBe(false);
  });

  it("acepta con solo equipoId", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      equipoId: "33333333-3333-3333-3333-333333333333",
    });
    expect(result.success).toBe(true);
  });

  it("acepta con solo ubicacion", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      ubicacion: "DEPOSITO",
    });
    expect(result.success).toBe(true);
  });
});

/**
 * Fix post-verify (hallazgo "límites de la base más estrictos que el
 * dominio"): espeja los techos de `plan-preventivo.entity.ts` (backend) —
 * `TITULO_MAX_LENGTH`/`UBICACION_MAX_LENGTH`/`INTERVALO_VALOR_MAXIMO`.
 */
describe("crearPlanPreventivoSchema — límites de largo/rango", () => {
  it("rechaza un título de 256 caracteres", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      titulo: "A".repeat(256),
      ubicacion: "DEPOSITO",
    });
    expect(result.success).toBe(false);
  });

  it("acepta un título de exactamente 255 caracteres", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      titulo: "A".repeat(255),
      ubicacion: "DEPOSITO",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una ubicación de 256 caracteres", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      ubicacion: "B".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un intervaloValor por encima del techo de negocio (3650)", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      ubicacion: "DEPOSITO",
      intervaloValor: "3651",
    });
    expect(result.success).toBe(false);
  });

  it("acepta un intervaloValor exactamente en el techo de negocio (3650)", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      ubicacion: "DEPOSITO",
      intervaloValor: "3650",
    });
    expect(result.success).toBe(true);
  });
});

/**
 * `editarPlanPreventivoSchema` (EP-R1, ADR-5) — reusa `camposComunes` menos
 * `fechaInicio` (no se edita desde este form) y suma `activo` (se cambia en
 * el mismo envío, sin endpoint aparte). Tarea 3.1.
 */
function baseValuesEdicion() {
  return {
    titulo: "Revisión mensual",
    prioridadId: "11111111-1111-1111-1111-111111111111",
    responsableId: "22222222-2222-2222-2222-222222222222",
    intervaloValor: "1",
    intervaloUnidad: "MESES" as const,
    activo: true,
    ubicacion: "DEPOSITO",
  };
}

describe("editarPlanPreventivoSchema — sin fechaInicio, con activo", () => {
  it("acepta un payload de edición completo sin fechaInicio", () => {
    const result = editarPlanPreventivoSchema.safeParse(baseValuesEdicion());
    expect(result.success).toBe(true);
  });

  it("rechaza cuando activo no es booleano", () => {
    const result = editarPlanPreventivoSchema.safeParse({ ...baseValuesEdicion(), activo: "si" });
    expect(result.success).toBe(false);
  });
});

/**
 * Centinela: `editarPlanPreventivoSchema` reusa los mismos techos que
 * `crearPlanPreventivoSchema` — si alguien reconstruye los campos a mano en
 * vez de reusar `camposComunes`, este test detecta la divergencia.
 */
describe("editarPlanPreventivoSchema — mismos topes que crearPlanPreventivoSchema (centinela)", () => {
  it.each([
    ["título (TITULO_MAX_LENGTH)", { titulo: "A".repeat(256) }],
    ["ubicación (UBICACION_MAX_LENGTH)", { ubicacion: "B".repeat(256) }],
    ["intervaloValor (INTERVALO_VALOR_MAXIMO)", { intervaloValor: "3651" }],
  ])("rechaza %s por encima del tope", (_campo, overrides) => {
    const result = editarPlanPreventivoSchema.safeParse({ ...baseValuesEdicion(), ...overrides });
    expect(result.success).toBe(false);
  });
});
