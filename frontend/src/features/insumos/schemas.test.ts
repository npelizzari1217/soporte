import { describe, it, expect } from "vitest";
import { registrarMovimientoInsumoSchema } from "./schemas";

/**
 * Validación cliente-side de `registrarMovimientoInsumoSchema` — espejo de
 * `RegistrarMovimientoInsumoHttpDto` (backend). Cubre las tres clases de
 * defecto de formularios del `AGENTS.md`: parseo es-AR, "vacío que se vuelve
 * valor" y topes sin espejar.
 */
function baseValues(): { cantidad: unknown } {
  return { cantidad: "10" };
}

describe("registrarMovimientoInsumoSchema — cantidad", () => {
  it("rechaza cero: el piso es exclusivo (@IsPositive del backend, no @Min(0))", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "0" });
    expect(result.success).toBe(false);
  });

  it("rechaza negativos", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "-5" });
    expect(result.success).toBe(false);
  });

  it("acepta un decimal positivo con hasta 2 decimales", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "10.5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cantidad).toBe(10.5);
  });

  it("rechaza más de 2 decimales", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "10.555" });
    expect(result.success).toBe(false);
  });

  /**
   * Clase "parseo" del AGENTS.md: `parsearNumeroEsAr` es tolerante al formato
   * es-AR (miles con punto, decimal con coma), no solo al crudo con punto
   * decimal. Un `Number("1.234,56")` daría `NaN` y rechazaría un valor que la
   * app sabe interpretar en cualquier otro campo numérico.
   */
  it("parsea formato es-AR (miles con punto, decimal con coma)", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "1.234,56" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cantidad).toBe(1234.56);
  });

  /**
   * Clase "vacío que se vuelve valor": un campo vacío tiene que dar
   * `required_error`, no colarse como `0` y pasar `.positive()` por accidente
   * ni fallar con un mensaje de "número inválido" que confunde al usuario.
   */
  it("cadena vacía es AUSENTE, no cero: da el mensaje de requerido", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "cantidad");
    expect(issue?.message).toBe("La cantidad es requerida");
  });

  it("solo espacios también es AUSENTE", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "   " });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "cantidad");
    expect(issue?.message).toBe("La cantidad es requerida");
  });

  it("texto no numérico da el mensaje de inválido, no el de requerido", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "abc" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "cantidad");
    expect(issue?.message).toBe("Ingresá una cantidad válida");
  });

  /**
   * Clase "topes sin espejar": el techo de negocio del backend es
   * `MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA = 1_000_000`
   * (`movimiento-insumo.entity.ts`). Sin este espejo, un valor por encima se
   * ve aceptado en pantalla y muere con un 400 remoto.
   */
  it("rechaza por encima del techo de negocio (1.000.000)", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "1000001" });
    expect(result.success).toBe(false);
  });

  it("acepta el techo exacto (1.000.000)", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ cantidad: "1000000" });
    expect(result.success).toBe(true);
  });
});

describe("registrarMovimientoInsumoSchema — motivo (OPCIONAL, incluso para la entrada)", () => {
  it("sin motivo es válido: el borde no lo exige, es una regla de negocio del ajuste", () => {
    const result = registrarMovimientoInsumoSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it("rechaza un motivo por encima de 500 caracteres", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({
      ...baseValues(),
      motivo: "A".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("acepta el motivo en el límite exacto de 500 caracteres", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({
      ...baseValues(),
      motivo: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  /**
   * El tope se mide TRIMEADO, igual que el backend (`@Transform` corre antes
   * que `@MaxLength`): 500 caracteres de contenido con espacios de borde
   * alrededor pasan las dos capas.
   */
  it("mide el tope sobre el motivo TRIMEADO, igual que el backend", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({
      ...baseValues(),
      motivo: `  ${"A".repeat(500)}  `,
    });
    expect(result.success).toBe(true);
  });
});

describe("registrarMovimientoInsumoSchema — equipoId/sectorId (UUID opcionales)", () => {
  it("acepta ambos ausentes", () => {
    const result = registrarMovimientoInsumoSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it("acepta cadena vacía (opción «sin equipo»/«sin sector» del select)", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({
      ...baseValues(),
      equipoId: "",
      sectorId: "",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un equipoId que no es UUID", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({ ...baseValues(), equipoId: "no-es-uuid" });
    expect(result.success).toBe(false);
  });

  it("acepta un equipoId/sectorId UUID válido", () => {
    const result = registrarMovimientoInsumoSchema.safeParse({
      ...baseValues(),
      equipoId: "11111111-1111-1111-1111-111111111111",
      sectorId: "22222222-2222-2222-2222-222222222222",
    });
    expect(result.success).toBe(true);
  });
});
