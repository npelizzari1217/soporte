import { describe, expect, it } from "vitest";
import { crearTipoComponenteSchema, renombrarTipoComponenteSchema } from "./schemas";
import {
  TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
  TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
  normalizarCodigo,
} from "./limites";

/**
 * Ninguna capa acotaba estos dos campos: el valor llegaba a Postgres y moría
 * con 22001 (500 crudo).
 *
 * `codigo` se mide NORMALIZADO, igual que en el dominio, porque
 * `toUpperCase()` puede agrandar el string.
 */
const largo = (n: number) => "a".repeat(n);

describe("crearTipoComponenteSchema — topes de largo", () => {
  it("acepta codigo y nombre en el límite exacto", () => {
    const r = crearTipoComponenteSchema.safeParse({
      codigo: largo(TIPO_COMPONENTE_CODIGO_MAX_LENGTH),
      nombre: largo(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un codigo que pasa el tope", () => {
    const r = crearTipoComponenteSchema.safeParse({
      codigo: largo(TIPO_COMPONENTE_CODIGO_MAX_LENGTH + 1),
      nombre: "CPU",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un nombre que pasa el tope", () => {
    const r = crearTipoComponenteSchema.safeParse({
      codigo: "CPU",
      nombre: largo(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  /**
   * El caso que obliga a medir el normalizado: 50 'ß' entran en el tope crudo,
   * pero al guardarse son 100 'S'. Si el front midiera lo tipeado, aceptaría
   * esto y el backend lo rechazaría.
   */
  it("rechaza un codigo que entra crudo pero se EXPANDE al normalizar", () => {
    const crudo = "ß".repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(crudo).toHaveLength(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(normalizarCodigo(crudo).length).toBeGreaterThan(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(crearTipoComponenteSchema.safeParse({ codigo: crudo, nombre: "CPU" }).success).toBe(
      false,
    );
  });

  /**
   * Regresión: el piso también se mide normalizado. "   " trimea a vacío, y el
   * backend lo rechaza porque su `@Transform` corre antes que `@IsNotEmpty`.
   * Midiendo el crudo, el front lo daba por válido y el usuario se comía un 400
   * por un campo que en pantalla se veía lleno.
   */
  it("rechaza un codigo de puros espacios, como hace el backend", () => {
    expect(crearTipoComponenteSchema.safeParse({ codigo: "   ", nombre: "CPU" }).success).toBe(
      false,
    );
  });

  /** Hermano invertido: un código normal, con espacios y minúsculas, sigue pasando. */
  it("acepta un codigo normal que la normalización no agranda", () => {
    expect(
      crearTipoComponenteSchema.safeParse({ codigo: "  ram-ddr4  ", nombre: "RAM" }).success,
    ).toBe(true);
  });
});

describe("renombrarTipoComponenteSchema — tope de nombre", () => {
  it("rechaza un nombre que pasa el tope", () => {
    const r = renombrarTipoComponenteSchema.safeParse({
      nombre: largo(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect(r.success).toBe(false);
  });

  it("sigue rechazando el nombre vacío: el tope no reemplaza al mínimo", () => {
    expect(renombrarTipoComponenteSchema.safeParse({ nombre: "" }).success).toBe(false);
  });
});

/** Centinela de VALOR: los topes son el ancho real de cada columna. */
it("los topes coinciden con el ancho de las columnas", () => {
  expect(TIPO_COMPONENTE_CODIGO_MAX_LENGTH).toBe(50);
  expect(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH).toBe(100);
});
