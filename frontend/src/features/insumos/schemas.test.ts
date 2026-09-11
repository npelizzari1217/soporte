import { describe, it, expect } from "vitest";
import {
  registrarMovimientoInsumoSchema,
  registrarSalidaInsumoSchema,
  registrarAjusteInsumoSchema,
  familiaInsumoSchema,
  unidadMedidaSchema,
  insumoSchema,
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

/**
 * Validación cliente-side del ABM de familias de insumo — espejo de
 * `CreateFamiliaInsumoDto` (`FAMILIA_INSUMO_CODIGO_MAX_LENGTH = 30`,
 * `FAMILIA_INSUMO_NOMBRE_MAX_LENGTH = 100`, `familia-insumo.entity.ts`).
 * Mismo criterio que `sectorSchema`: el backend sigue siendo la fuente de
 * verdad, esto solo adelanta el feedback.
 */
describe("familiaInsumoSchema — límites de largo (espejo de CreateFamiliaInsumoDto)", () => {
  it("rechaza codigo de más de 30 caracteres", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "A".repeat(31), nombre: "Tóner" });
    expect(result.success).toBe(false);
  });

  it("acepta codigo de exactamente 30 caracteres", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "A".repeat(30), nombre: "Tóner" });
    expect(result.success).toBe(true);
  });

  /**
   * El `@Transform` del `nombre` corre ANTES de su `@MinLength(1)` en el borde
   * (lo dice el JSDoc de `CreateFamiliaInsumoDto`): un nombre de solo espacios llega
   * recortado y el backend lo rechaza. Sin el `.trim()` del schema, el front lo
   * dejaba pasar y el usuario perdía lo tipeado contra un 400 remoto. El caso
   * hermano de `codigo` ya existía; este cierra la cobertura parcial.
   */
  it("rechaza nombre de solo espacios", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER", nombre: "   " });
    expect(result.success).toBe(false);
  });

  it("mide el tope del nombre DESPUÉS de recortar, igual que el borde", () => {
    const alBorde = " " + "A".repeat(100) + " ";
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER", nombre: alBorde });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre de más de 100 caracteres", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER", nombre: "N".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("acepta nombre de exactamente 100 caracteres", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER", nombre: "N".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("rechaza codigo vacío", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "", nombre: "Tóner" });
    expect(result.success).toBe(false);
  });

  it("rechaza codigo con caracteres fuera de mayúsculas/números/guion bajo", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "toner-1", nombre: "Tóner" });
    expect(result.success).toBe(false);
  });

  it("acepta un codigo válido", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER_1", nombre: "Tóner" });
    expect(result.success).toBe(true);
  });

  /**
   * `esRepuesto` distingue un repuesto de equipo de un consumible (WU-1,
   * sdd/repuestos-familias). Ausente en el input tiene que quedar en
   * `false` en el output parseado — no solo `success: true`, que también
   * sería cierto si `.default()` se rompiera y el campo quedara
   * `undefined`.
   */
  it("esRepuesto ausente parsea a false", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "TONER", nombre: "Tóner" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.esRepuesto).toBe(false);
  });

  it("esRepuesto en true se preserva en el output parseado", () => {
    const result = familiaInsumoSchema.safeParse({ codigo: "CPU", nombre: "CPU", esRepuesto: true });
    expect(result.success).toBe(true);
    expect(result.success && result.data.esRepuesto).toBe(true);
  });
});

/**
 * Validación cliente-side del ABM de unidades de medida — espejo de
 * `CreateUnidadMedidaDto` (`UNIDAD_MEDIDA_CODIGO_MAX_LENGTH = 20`,
 * `UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH = 50`, `unidad-medida.entity.ts`).
 */
describe("unidadMedidaSchema — límites de largo (espejo de CreateUnidadMedidaDto)", () => {
  it("rechaza codigo de más de 20 caracteres", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "A".repeat(21), nombre: "Unidad" });
    expect(result.success).toBe(false);
  });

  it("acepta codigo de exactamente 20 caracteres", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "A".repeat(20), nombre: "Unidad" });
    expect(result.success).toBe(true);
  });

  /**
   * El `@Transform` del `nombre` corre ANTES de su `@MinLength(1)` en el borde
   * (lo dice el JSDoc de `CreateUnidadMedidaDto`): un nombre de solo espacios llega
   * recortado y el backend lo rechaza. Sin el `.trim()` del schema, el front lo
   * dejaba pasar y el usuario perdía lo tipeado contra un 400 remoto. El caso
   * hermano de `codigo` ya existía; este cierra la cobertura parcial.
   */
  it("rechaza nombre de solo espacios", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "UN", nombre: "   " });
    expect(result.success).toBe(false);
  });

  it("mide el tope del nombre DESPUÉS de recortar, igual que el borde", () => {
    const alBorde = " " + "A".repeat(50) + " ";
    const result = unidadMedidaSchema.safeParse({ codigo: "UN", nombre: alBorde });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre de más de 50 caracteres", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "UN", nombre: "N".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("acepta nombre de exactamente 50 caracteres", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "UN", nombre: "N".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("rechaza codigo con caracteres fuera de mayúsculas/números/guion bajo", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "un-1", nombre: "Unidad" });
    expect(result.success).toBe(false);
  });

  it("acepta un codigo válido", () => {
    const result = unidadMedidaSchema.safeParse({ codigo: "UN_1", nombre: "Unidad" });
    expect(result.success).toBe(true);
  });
});

/**
 * Validación cliente-side del ABM del insumo — espejo de
 * `CreateInsumoDto`/`EditInsumoDto` (`INSUMO_CODIGO_MAX_LENGTH = 50`,
 * `INSUMO_NOMBRE_MAX_LENGTH = 255`, `insumo.entity.ts`), RECORTADO al scope
 * de esta entrega: sin `codigosAlternativos`/`compatibilidad`.
 */
function baseInsumoValues(): Record<string, unknown> {
  return { codigo: "TON_001", nombre: "Tóner", familiaId: "fam-1", unidadMedidaId: "um-1" };
}

describe("insumoSchema — límites de codigo/nombre (espejo de CreateInsumoDto)", () => {
  it("rechaza codigo de más de 50 caracteres", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "A".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("acepta codigo de exactamente 50 caracteres", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "A".repeat(50) });
    expect(result.success).toBe(true);
  });

  /**
   * El `@Transform` del `nombre` corre ANTES de su `@MinLength(1)` en el borde
   * (lo dice el JSDoc de `CreateInsumoDto`): un nombre de solo espacios llega
   * recortado y el backend lo rechaza. Sin el `.trim()` del schema, el front lo
   * dejaba pasar y el usuario perdía lo tipeado contra un 400 remoto. El caso
   * hermano de `codigo` ya existía; este cierra la cobertura parcial.
   */
  it("rechaza nombre de solo espacios", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), nombre: "   " });
    expect(result.success).toBe(false);
  });

  it("mide el tope del nombre DESPUÉS de recortar, igual que el borde", () => {
    const alBorde = " " + "A".repeat(255) + " ";
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), nombre: alBorde });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre de más de 255 caracteres", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), nombre: "N".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("acepta nombre de exactamente 255 caracteres", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), nombre: "N".repeat(255) });
    expect(result.success).toBe(true);
  });

  /**
   * A DIFERENCIA de `familiaInsumoSchema`/`unidadMedidaSchema`, el código del
   * insumo NO lleva patrón: `CreateInsumoDto`/`EditInsumoDto` no tienen
   * `@Matches` sobre `codigo` — su única normalización es
   * `normalizarCodigoInsumo` (`trim().toUpperCase()`). Un patrón acá sería
   * MÁS ESTRICTO que el borde, y volvería INEDITABLE desde el front a
   * cualquier insumo ya guardado cuyo código traiga un guion: el usuario no
   * podría ni corregirle el nombre sin antes cambiarle el código.
   */
  it("acepta codigo con guion — el backend no le impone patrón", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "TON-001" });
    expect(result.success).toBe(true);
  });

  it("acepta codigo en minúsculas — lo normaliza a mayúsculas el backend", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "ton-001" });
    expect(result.success).toBe(true);
  });

  /**
   * El `@MinLength(1)` del borde mide DESPUÉS del `@Transform`, así que un
   * código de solo espacios llega vacío y el backend lo rechaza. Sin el
   * `.trim()` acá, el front lo dejaba pasar y el usuario cobraba un 400.
   */
  /**
   * Forma 3 de fallo de tope del AGENTS.md: tope en las dos capas que NO
   * coincide con la columna. El borde mide DESPUÉS de `trim().toUpperCase()`, y
   * `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en `'SS'`—. Un
   * `.max()` sobre el crudo aceptaba 50 caracteres que se persisten como 100.
   */
  it("mide el tope del codigo sobre el NORMALIZADO: 50 'ß' son 100 al persistirse", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "ß".repeat(50) });
    expect(result.success).toBe(false);
  });

  /**
   * Issue #162: el código dejó de ser obligatorio en el alta. Vacío o de solo
   * espacios ya no se rechaza acá — es la señal de "autogenerar", que decide
   * el diálogo (`InsumoFormDialog`), no el schema.
   */
  it("acepta codigo vacío o de solo espacios — el backend lo autogenera", () => {
    const vacio = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "" });
    const espacios = insumoSchema.safeParse({ ...baseInsumoValues(), codigo: "   " });

    expect(vacio.success).toBe(true);
    expect(espacios.success).toBe(true);
  });
});

describe("insumoSchema — familiaId/unidadMedidaId requeridos", () => {
  it("rechaza familiaId vacío (sin elegir en el select)", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), familiaId: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza unidadMedidaId vacío (sin elegir en el select)", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), unidadMedidaId: "" });
    expect(result.success).toBe(false);
  });
});

/**
 * `stockMinimo` es OPCIONAL y NULLABLE en el dominio: ausente/vacío es "sin
 * punto definido", que NO es cero. A diferencia de `cantidadMovimientoSchema`,
 * el piso ES cero (`INSUMO_STOCK_MINIMO_MINIMO = 0`) — cero es un punto de
 * reposición legítimo, no un movimiento inválido.
 */
describe("insumoSchema — stockMinimo (opcional, nullable, tope de decimales)", () => {
  it("vacío → stockMinimo queda undefined (AUSENTE, no cero)", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stockMinimo).toBeUndefined();
  });

  it("acepta cero como stock mínimo legítimo", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "0" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stockMinimo).toBe(0);
  });

  it("rechaza un valor negativo", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "-1" });
    expect(result.success).toBe(false);
  });

  it("rechaza más de 2 decimales (Postgres redondearía en silencio)", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "12.345" });
    expect(result.success).toBe(false);
  });

  it("acepta exactamente 2 decimales", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "12.34" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stockMinimo).toBe(12.34);
  });

  it("rechaza un valor por encima del techo de negocio (1.000.000)", () => {
    const result = insumoSchema.safeParse({ ...baseInsumoValues(), stockMinimo: "1000001" });
    expect(result.success).toBe(false);
  });
});
