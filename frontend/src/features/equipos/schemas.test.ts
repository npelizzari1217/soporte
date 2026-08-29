import { describe, it, expect } from "vitest";
import type { ZodIssue } from "zod";
import { crearEquipoSchema, componenteSchema } from "./schemas";

/**
 * Validación cliente-side de los topes de largo/rango de `equipos_informaticos`/
 * `componentes_equipo` (fix defecto "límites de equipos", sdd/limites-db) —
 * espejo de `EQUIPO_*`/`COMPONENTE_*` en el backend. El dominio/DTO del
 * backend son la autoridad real; este schema solo mejora el feedback antes de
 * pegarle a la API.
 */
function baseEquipoValues(): { nombre: string } {
  return { nombre: "Notebook Dell" };
}

function baseComponenteValues(): { tipoComponenteCodigo: string } {
  return { tipoComponenteCodigo: "RAM" };
}

/**
 * Busca el issue DE UN CAMPO PUNTUAL entre los errores de zod. Devolver el
 * issue completo (no solo `result.success`) es lo que permite morder por la
 * razón correcta: un objeto inválido por OTRO campo también da
 * `success: false`, pero no produce ningún issue con este `path` — sin este
 * chequeo, un `expect(result.success).toBe(false)` a secas queda satisfecho
 * por construcción con romper cualquier campo del objeto (defecto detectado
 * en revisión: 9 de 17 tests del intento anterior seguían en verde tras
 * mutar un campo NO relacionado).
 */
function issueDe(issues: ZodIssue[], campo: string): ZodIssue | undefined {
  return issues.find((issue) => issue.path[0] === campo);
}

describe("crearEquipoSchema — límites de largo", () => {
  it.each([
    ["nombre", 256, "too_big"],
    ["numeroSerie", 256, "too_big"],
    ["marca", 101, "too_big"],
    ["modelo", 101, "too_big"],
    // `ubicacion` usa `.refine()` (no `.max()`, ver JSDoc en schemas.ts), así
    // que su código de issue es `custom`, no `too_big`.
    ["ubicacion", 256, "custom"],
  ] as const)("rechaza %s de longitud %i, por %s", (campo, longitud, code) => {
    const valor = "A".repeat(longitud);
    const result = crearEquipoSchema.safeParse({ ...baseEquipoValues(), [campo]: valor });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, campo);
    expect(issue?.code).toBe(code);
  });

  it.each([
    ["nombre", 255],
    ["numeroSerie", 255],
    ["marca", 100],
    ["modelo", 100],
    ["ubicacion", 255],
  ] as const)("acepta %s en el límite exacto (%i caracteres)", (campo, longitud) => {
    const valor = "A".repeat(longitud);
    const result = crearEquipoSchema.safeParse({ ...baseEquipoValues(), [campo]: valor });
    expect(result.success).toBe(true);
  });

  // `ubicacion` mide el largo NORMALIZADO (a mayúscula), no el crudo: 'ß' se
  // expande 1→2 al normalizar ('SS'). Espejo de la costura backend
  // (equipos.dto.spec.ts). Par completo: rechaza + su hermano invertido.
  it("rechaza ubicacion cuyo normalizado excede el tope aunque el crudo no lo exceda", () => {
    const result = crearEquipoSchema.safeParse({
      ...baseEquipoValues(),
      ubicacion: "ß".repeat(200), // crudo: 200 (≤255) — normalizado: 400 (>255)
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, "ubicacion");
    expect(issue?.code).toBe("custom");
  });

  it("acepta ubicacion cuyo normalizado entra en el tope exacto (hermano invertido)", () => {
    const result = crearEquipoSchema.safeParse({
      ...baseEquipoValues(),
      ubicacion: "ß".repeat(127), // crudo: 127 — normalizado: 254 (≤255)
    });
    expect(result.success).toBe(true);
  });
});

describe("crearEquipoSchema — importe/valorResidual", () => {
  it.each([
    ["importe", "-1"],
    ["importe", "100000000"],
    ["importe", "abc"],
    // 3 decimales: en el intento anterior pasaba el schema (sin chequeo de
    // decimales) y el DTO lo rebotaba con `@IsNumber({maxDecimalPlaces:2})`
    // → 400 remoto por algo que se veía aceptado en pantalla.
    ["importe", "100.999"],
    ["valorResidual", "-1"],
    ["valorResidual", "100000000"],
    ["valorResidual", "abc"],
    ["valorResidual", "100.999"],
  ] as const)("rechaza %s = %s", (campo, valor) => {
    const result = crearEquipoSchema.safeParse({ ...baseEquipoValues(), [campo]: valor });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, campo);
    expect(issue?.code).toBe("custom");
  });

  it.each([
    ["importe", "0"],
    ["importe", "99999999"],
    // Separador decimal coma (formato rioplatense): el MISMO parser
    // (`parseImporte`) que arma el payload real ya lo acepta como `1000.5` —
    // ver JSDoc de `validarValorMonetario` en schemas.ts. Antes un `Number()`
    // crudo en el schema lo rechazaba (`Number("1000,50")` → `NaN`) pese a que
    // el front terminaba enviándolo igual.
    ["importe", "1000,50"],
    ["importe", "1000.5"],
    ["valorResidual", "0"],
    ["valorResidual", "99999999"],
    ["valorResidual", "1000,50"],
  ] as const)("acepta %s = %s", (campo, valor) => {
    const result = crearEquipoSchema.safeParse({ ...baseEquipoValues(), [campo]: valor });
    expect(result.success).toBe(true);
  });

  it("acepta importe/valorResidual vacíos (campo opcional)", () => {
    const result = crearEquipoSchema.safeParse(baseEquipoValues());
    expect(result.success).toBe(true);
  });
});

describe("componenteSchema — límites de largo", () => {
  it.each([
    ["descripcion", 256],
    ["numeroSerie", 256],
    ["capacidad", 101],
  ] as const)("rechaza %s de longitud %i, por too_big", (campo, longitud) => {
    const valor = "A".repeat(longitud);
    const result = componenteSchema.safeParse({ ...baseComponenteValues(), [campo]: valor });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, campo);
    expect(issue?.code).toBe("too_big");
  });

  it.each([
    ["descripcion", 255],
    ["numeroSerie", 255],
    ["capacidad", 100],
  ] as const)("acepta %s en el límite exacto (%i caracteres)", (campo, longitud) => {
    const valor = "A".repeat(longitud);
    const result = componenteSchema.safeParse({ ...baseComponenteValues(), [campo]: valor });
    expect(result.success).toBe(true);
  });
});
