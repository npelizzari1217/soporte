import { describe, expect, it } from "vitest";
import { feriadoSchema } from "./schemas";
import { FECHA_CALENDARIO_REGEX, FERIADO_DESCRIPCION_MAX_LENGTH } from "./limites";

const BASE = { fecha: "2026-12-25", descripcion: "Navidad" };
const largo = (n: number) => "a".repeat(n);

describe("feriadoSchema — tope de descripción", () => {
  it("acepta una descripción en el límite exacto", () => {
    const r = feriadoSchema.safeParse({
      ...BASE,
      descripcion: largo(FERIADO_DESCRIPCION_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza una descripción que pasa el tope", () => {
    const r = feriadoSchema.safeParse({
      ...BASE,
      descripcion: largo(FERIADO_DESCRIPCION_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("sigue rechazando la descripción vacía: el tope no reemplaza al mínimo", () => {
    expect(feriadoSchema.safeParse({ ...BASE, descripcion: "" }).success).toBe(false);
  });
});

describe("feriadoSchema — formato de fecha", () => {
  it("acepta una fecha 'YYYY-MM-DD'", () => {
    expect(feriadoSchema.safeParse(BASE).success).toBe(true);
  });

  it("rechaza un datetime con hora/offset (D2: solo fecha, nunca datetime)", () => {
    const r = feriadoSchema.safeParse({ ...BASE, fecha: "2026-12-25T00:00:00-03:00" });
    expect(r.success).toBe(false);
  });

  it("rechaza la fecha vacía", () => {
    expect(feriadoSchema.safeParse({ ...BASE, fecha: "" }).success).toBe(false);
  });
});

/** Centinela de VALOR: el tope es una copia a mano de la autoridad del backend. */
it("el tope de descripción coincide con `FERIADO_DESCRIPCION_MAX_LENGTH` del backend", () => {
  expect(FERIADO_DESCRIPCION_MAX_LENGTH).toBe(200);
});

/** Centinela de VALOR: el regex es una copia a mano de `FECHA_CALENDARIO_REGEX` del backend. */
it("el regex de fecha coincide con `FECHA_CALENDARIO_REGEX` del backend", () => {
  expect(FECHA_CALENDARIO_REGEX.source).toBe("^\\d{4}-\\d{2}-\\d{2}$");
});
