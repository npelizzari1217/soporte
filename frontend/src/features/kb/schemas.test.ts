import { describe, expect, it } from "vitest";
import { kbArticuloSchema } from "./schemas";
import { KB_TITULO_MAX_LENGTH } from "./limites";

/**
 * No lo acotaba ninguna capa: el título llegaba a la columna `VarChar(255)` y
 * moría con 22001 (500 crudo).
 */
const BASE = { contenido: "Contenido del artículo" };
const largo = (n: number) => "a".repeat(n);

describe("kbArticuloSchema — tope de titulo", () => {
  it("acepta un titulo en el límite exacto", () => {
    expect(kbArticuloSchema.safeParse({ ...BASE, titulo: largo(KB_TITULO_MAX_LENGTH) }).success).toBe(
      true,
    );
  });

  it("rechaza un titulo que pasa el tope", () => {
    expect(
      kbArticuloSchema.safeParse({ ...BASE, titulo: largo(KB_TITULO_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("sigue rechazando el titulo vacío: el tope no reemplaza al mínimo", () => {
    expect(kbArticuloSchema.safeParse({ ...BASE, titulo: "" }).success).toBe(false);
  });

  /**
   * Regresión: el piso también se mide trimeado. El backend rechaza "   " con
   * `TituloVacioError`; midiendo el crudo, el front lo daba por válido y el
   * usuario se comía un 422 por un campo que en pantalla se veía lleno.
   */
  it("rechaza un titulo de puros espacios, como hace el backend", () => {
    expect(kbArticuloSchema.safeParse({ ...BASE, titulo: "   " }).success).toBe(false);
  });

  /** Hermano invertido: el contenido NO se acota, su columna es Text. */
  it("acepta un contenido larguísimo: su columna es Text, sin límite", () => {
    expect(
      kbArticuloSchema.safeParse({
        titulo: "Cómo cargar un ticket",
        contenido: largo(KB_TITULO_MAX_LENGTH * 100),
      }).success,
    ).toBe(true);
  });
});

/** Centinela de VALOR: el tope es el ancho real de la columna. */
it("el tope coincide con el ancho de la columna", () => {
  expect(KB_TITULO_MAX_LENGTH).toBe(255);
});
