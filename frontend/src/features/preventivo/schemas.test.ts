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
 * `ubicacion` se normaliza (trim + mayúscula) DENTRO del schema, antes de medir
 * el tope — espeja a `normalizarUbicacion` + `validarUbicacionLargo` del dominio
 * (`plan-preventivo.entity.ts:110-132`), que también miden post-normalización.
 *
 * Antes, el front medía el valor CRUDO y el submit mandaba el normalizado: dos
 * strings distintos, uno validado y otro enviado. `toUpperCase()` puede AGRANDAR
 * un string ('ß' → 'SS'), así que 255 caracteres validos en pantalla llegaban al
 * backend como 256 y volvían como un 400 que la pantalla daba por bueno.
 */
describe("ubicacion — se normaliza antes de medir el tope (espejo del dominio)", () => {
  it("rechaza 255 caracteres que pasan a 256 al pasar a mayúscula ('ß' → 'SS')", () => {
    const crudo = "ß" + "A".repeat(254);
    expect(crudo.length).toBe(255);
    expect(crudo.toUpperCase().length).toBe(256);

    const result = crearPlanPreventivoSchema.safeParse({ ...baseValues(), ubicacion: crudo });
    expect(result.success).toBe(false);
  });

  it("hermano invertido: 255 caracteres que NO crecen al normalizar se aceptan", () => {
    const result = crearPlanPreventivoSchema.safeParse({ ...baseValues(), ubicacion: "A".repeat(255) });
    expect(result.success).toBe(true);
  });

  it("recorta los bordes ANTES de medir: 255 útiles con espacios alrededor se aceptan", () => {
    const result = crearPlanPreventivoSchema.safeParse({
      ...baseValues(),
      ubicacion: `   ${"A".repeat(255)}   `,
    });
    expect(result.success).toBe(true);
  });

  it("el valor parseado sale normalizado, para que lo validado y lo enviado sean el MISMO string", () => {
    const result = crearPlanPreventivoSchema.safeParse({ ...baseValues(), ubicacion: "  deposito norte  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ubicacion).toBe("DEPOSITO NORTE");
  });

  it("el schema de EDICIÓN normaliza igual (reusa camposComunes)", () => {
    const result = editarPlanPreventivoSchema.safeParse({
      ...baseValuesEdicion(),
      ubicacion: "  deposito norte  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ubicacion).toBe("DEPOSITO NORTE");
  });

  it("solo espacios sigue contando como 'sin ubicación' (dispara el XOR del objetivo)", () => {
    const result = crearPlanPreventivoSchema.safeParse({ ...baseValues(), ubicacion: "     " });
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
