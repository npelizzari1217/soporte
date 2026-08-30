import { describe, expect, it } from "vitest";
import { crearReparacionSchema, crearSubtareaSchema } from "./schemas";
import { SUBTAREA_DESCRIPCION_MAX_LENGTH, UBICACION_MAX_LENGTH } from "./limites";

/**
 * `ubicacion` y la `descripcion` de subtarea no las acotaba ninguna capa: el
 * valor llegaba a Postgres y moría con 22001 (500 crudo). Cerrado el backend,
 * el front tiene que espejarlo o el usuario cambia un 500 por un 400 remoto,
 * que sigue perdiéndole lo tipeado.
 */
const REPARACION_VALIDA = {
  titulo: "Filtración en el baño",
  prioridadId: "9f1a0b2c-3d4e-4f50-8a61-72b83c94d5e6",
};

const largo = (n: number) => "a".repeat(n);

describe("crearReparacionSchema — tope de ubicacion", () => {
  it("acepta una ubicacion en el límite exacto", () => {
    const r = crearReparacionSchema.safeParse({
      ...REPARACION_VALIDA,
      ubicacion: largo(UBICACION_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza una ubicacion que pasa el tope", () => {
    const r = crearReparacionSchema.safeParse({
      ...REPARACION_VALIDA,
      ubicacion: largo(UBICACION_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("sigue aceptando la reparación sin ubicacion: el tope no la vuelve obligatoria", () => {
    expect(crearReparacionSchema.safeParse(REPARACION_VALIDA).success).toBe(true);
  });
});

describe("crearSubtareaSchema — tope de descripcion", () => {
  it("acepta una descripcion en el límite exacto", () => {
    const r = crearSubtareaSchema.safeParse({ descripcion: largo(SUBTAREA_DESCRIPCION_MAX_LENGTH) });
    expect(r.success).toBe(true);
  });

  it("rechaza una descripcion que pasa el tope", () => {
    const r = crearSubtareaSchema.safeParse({
      descripcion: largo(SUBTAREA_DESCRIPCION_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("sigue rechazando la descripcion vacía: el tope no reemplaza al mínimo", () => {
    expect(crearSubtareaSchema.safeParse({ descripcion: "" }).success).toBe(false);
  });
});

/**
 * Centinela de VALOR: los casos de arriba derivan sus largos de la constante,
 * así que verifican el cableado pero no el número. Esto lo clava contra el
 * ancho real de las dos columnas.
 */
it("los topes coinciden con el ancho de las columnas", () => {
  expect(UBICACION_MAX_LENGTH).toBe(255);
  expect(SUBTAREA_DESCRIPCION_MAX_LENGTH).toBe(255);
});
