import { describe, it, expect } from "vitest";
import { respuestaPredefinidaSchema } from "./schemas";

/** Espejo de los topes de `CreateRespuestaPredefinidaDto` (backend). */
describe("respuestaPredefinidaSchema", () => {
  const valido = { titulo: "Saludo", texto: "Hola" };

  it("acepta un caso válido", () => {
    expect(respuestaPredefinidaSchema.safeParse(valido).success).toBe(true);
  });

  it.each([
    ["titulo", 100, 101],
    ["texto", 4000, 4001],
  ] as const)("%s: acepta exactamente %i y rechaza %i caracteres", (campo, tope, excedido) => {
    expect(respuestaPredefinidaSchema.safeParse({ ...valido, [campo]: "x".repeat(tope) }).success).toBe(true);
    expect(respuestaPredefinidaSchema.safeParse({ ...valido, [campo]: "x".repeat(excedido) }).success).toBe(false);
  });

  it.each(["", "   "])("rechaza título y texto vacíos o de solo espacios (%j)", (vacio) => {
    expect(respuestaPredefinidaSchema.safeParse({ ...valido, titulo: vacio }).success).toBe(false);
    expect(respuestaPredefinidaSchema.safeParse({ ...valido, texto: vacio }).success).toBe(false);
  });
});
