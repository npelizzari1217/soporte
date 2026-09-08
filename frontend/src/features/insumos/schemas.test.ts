import { describe, it, expect } from "vitest";
import {
  registrarMovimientoInsumoSchema,
  registrarSalidaInsumoSchema,
  registrarAjusteInsumoSchema,
} from "./schemas";

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

/**
 * `registrarSalidaInsumoSchema` agrega el tope de stock por encima de
 * `registrarMovimientoInsumoSchema`: es un `.refine()` sobre ese mismo
 * schema, así que estos tests solo cubren la diferencia — el resto de las
 * reglas de `cantidad`/`motivo`/`equipoId`/`sectorId` ya está probado arriba.
 */
describe("registrarSalidaInsumoSchema — tope contra el stock disponible", () => {
  it("rechaza una cantidad por encima del stock disponible, con un mensaje sobre 'cantidad'", () => {
    const result = registrarSalidaInsumoSchema(5).safeParse({ cantidad: "10" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "cantidad");
    expect(issue?.message).toMatch(/no hay existencia suficiente/i);
    expect(issue?.message).toContain("5,00");
  });

  it("acepta una cantidad igual al stock disponible: el techo es inclusivo", () => {
    const result = registrarSalidaInsumoSchema(5).safeParse({ cantidad: "5" });
    expect(result.success).toBe(true);
  });

  it("acepta una cantidad por debajo del stock disponible", () => {
    const result = registrarSalidaInsumoSchema(5).safeParse({ cantidad: "4" });
    expect(result.success).toBe(true);
  });

  /**
   * `stockDisponible: undefined` cubre "todavía no resuelto o la consulta
   * falló" (ver JSDoc de la función): el tope se DESACTIVA, nunca se trata
   * como `0` — con `0` cualquier cantidad positiva rechazaría.
   */
  it("con stockDisponible undefined no aplica tope alguno", () => {
    const result = registrarSalidaInsumoSchema(undefined).safeParse({ cantidad: "1000000" });
    expect(result.success).toBe(true);
  });

  it("con stockDisponible en 0, cualquier cantidad positiva se rechaza por el tope", () => {
    const result = registrarSalidaInsumoSchema(0).safeParse({ cantidad: "1" });
    expect(result.success).toBe(false);
  });
});

/** Valores base de un ajuste válido: solo lo que cada test necesita override. */
function baseAjusteValues(tipo: "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO" = "AJUSTE_POSITIVO"): {
  cantidad: unknown;
  tipo: unknown;
  motivo: unknown;
} {
  return { cantidad: "10", tipo, motivo: "Conteo físico de fin de mes" };
}

/**
 * `registrarAjusteInsumoSchema` agrega DOS cosas sobre
 * `registrarMovimientoInsumoSchema`: el discriminador `tipo` y un `motivo`
 * que pasa de opcional a REQUERIDO. La diferencia con la salida es a
 * propósito — ver el JSDoc de la función: acá no hay carrera, el dominio
 * exige motivo siempre, así que corresponde espejarlo en el cliente.
 */
describe("registrarAjusteInsumoSchema — tipo", () => {
  it("acepta AJUSTE_POSITIVO", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse(baseAjusteValues("AJUSTE_POSITIVO"));
    expect(result.success).toBe(true);
  });

  it("acepta AJUSTE_NEGATIVO", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse(baseAjusteValues("AJUSTE_NEGATIVO"));
    expect(result.success).toBe(true);
  });

  it("rechaza un tipo fuera de las dos direcciones del ajuste (p. ej. ENTRADA)", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      ...baseAjusteValues(),
      tipo: "ENTRADA",
    });
    expect(result.success).toBe(false);
  });

  it("sin tipo, rechaza con el mensaje de requerido", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      cantidad: "10",
      motivo: "Conteo físico de fin de mes",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "tipo");
    expect(issue?.message).toBe("El tipo de ajuste es requerido");
  });
});

describe("registrarAjusteInsumoSchema — motivo (REQUERIDO, a diferencia de entrada/salida)", () => {
  it("sin motivo, rechaza con el mensaje de requerido", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      cantidad: "10",
      tipo: "AJUSTE_POSITIVO",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "motivo");
    expect(issue?.message).toBe("El motivo es requerido");
  });

  it("un motivo de puros espacios no es contenido: rechaza con el mismo mensaje de requerido", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      ...baseAjusteValues(),
      motivo: "     ",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "motivo");
    expect(issue?.message).toBe("El motivo es requerido");
  });

  it("un motivo con contenido rodeado de espacios de borde se acepta", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      ...baseAjusteValues(),
      motivo: "  Conteo físico  ",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un motivo por encima de 500 caracteres, medido TRIMEADO", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      ...baseAjusteValues(),
      motivo: `  ${"A".repeat(501)}  `,
    });
    expect(result.success).toBe(false);
  });
});

/**
 * El tope de stock del ajuste replica `registrarSalidaInsumoSchema` con un
 * agregado: solo corre cuando el `tipo` elegido es `AJUSTE_NEGATIVO`. Un
 * `AJUSTE_POSITIVO` sube la existencia — nunca puede quedarse corto de nada,
 * así que ninguna cantidad lo rechaza por este motivo.
 */
describe("registrarAjusteInsumoSchema — tope de stock, SOLO en AJUSTE_NEGATIVO", () => {
  it("AJUSTE_NEGATIVO por encima del stock disponible se rechaza", () => {
    const result = registrarAjusteInsumoSchema(5).safeParse({
      ...baseAjusteValues("AJUSTE_NEGATIVO"),
      cantidad: "10",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path[0] === "cantidad");
    expect(issue?.message).toMatch(/no hay existencia suficiente/i);
  });

  it("AJUSTE_NEGATIVO igual o por debajo del stock disponible se acepta", () => {
    const result = registrarAjusteInsumoSchema(5).safeParse({
      ...baseAjusteValues("AJUSTE_NEGATIVO"),
      cantidad: "5",
    });
    expect(result.success).toBe(true);
  });

  it("AJUSTE_POSITIVO por encima del 'stock disponible' se acepta igual: el tope no le aplica", () => {
    const result = registrarAjusteInsumoSchema(5).safeParse({
      ...baseAjusteValues("AJUSTE_POSITIVO"),
      cantidad: "1000",
    });
    expect(result.success).toBe(true);
  });

  it("con stockDisponible undefined, un AJUSTE_NEGATIVO no queda topado", () => {
    const result = registrarAjusteInsumoSchema(undefined).safeParse({
      ...baseAjusteValues("AJUSTE_NEGATIVO"),
      cantidad: "1000000",
    });
    expect(result.success).toBe(true);
  });
});
