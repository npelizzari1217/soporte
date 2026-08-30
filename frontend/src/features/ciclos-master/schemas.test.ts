import { describe, expect, it } from "vitest";
import { cicloVigenteSchema } from "./schemas";
import { CICLO_VIGENTE_NOMBRE_MAX_LENGTH } from "./limites";

/**
 * No lo acotaba ninguna capa: el nombre llegaba a la columna `VarChar(100)` y
 * moría con 22001 (500 crudo).
 */
const BASE = { fechaInicio: "2026-01-01", fechaFin: "2026-12-31" };
const largo = (n: number) => "a".repeat(n);

describe("cicloVigenteSchema — tope de nombre", () => {
  it("acepta un nombre en el límite exacto", () => {
    const r = cicloVigenteSchema.safeParse({
      ...BASE,
      nombre: largo(CICLO_VIGENTE_NOMBRE_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un nombre que pasa el tope", () => {
    const r = cicloVigenteSchema.safeParse({
      ...BASE,
      nombre: largo(CICLO_VIGENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("sigue rechazando el nombre vacío: el tope no reemplaza al mínimo", () => {
    expect(cicloVigenteSchema.safeParse({ ...BASE, nombre: "" }).success).toBe(false);
  });
});

/** Centinela de VALOR: el tope es el ancho real de la columna. */
it("el tope coincide con el ancho de la columna", () => {
  expect(CICLO_VIGENTE_NOMBRE_MAX_LENGTH).toBe(100);
});
