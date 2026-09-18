import { describe, it, expect } from "vitest";
import type { ZodIssue } from "zod";
import { modeloEquipoSchema } from "./schemas";

/**
 * Validación cliente-side de los topes de largo de `modelos_equipo`
 * (`marca` 100, `modelo` 150) — espejo de `MODELO_EQUIPO_*_MAX_LENGTH` en el
 * backend. El dominio del backend es la autoridad real; este schema solo
 * mejora el feedback antes de pegarle a la API.
 */
function baseValues(): { marca: string; modelo: string } {
  return { marca: "HP", modelo: "LaserJet Pro M404" };
}

/**
 * Busca el issue DE UN CAMPO PUNTUAL entre los errores de zod — mismo motivo
 * que `issueDe` en `features/equipos/schemas.test.ts`: un objeto inválido por
 * OTRO campo también da `success: false` sin decir nada sobre este campo.
 */
function issueDe(issues: ZodIssue[], campo: string): ZodIssue | undefined {
  return issues.find((issue) => issue.path[0] === campo);
}

describe("modeloEquipoSchema — límites de largo", () => {
  it.each([
    ["marca", 101, "custom"],
    ["modelo", 151, "too_big"],
  ] as const)("rechaza %s de longitud %i, por %s", (campo, longitud, code) => {
    const valor = "A".repeat(longitud);
    const result = modeloEquipoSchema.safeParse({ ...baseValues(), [campo]: valor });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, campo);
    expect(issue?.code).toBe(code);
  });

  it.each([
    ["marca", 100],
    ["modelo", 150],
  ] as const)("acepta %s en el límite exacto (%i caracteres)", (campo, longitud) => {
    const valor = "A".repeat(longitud);
    const result = modeloEquipoSchema.safeParse({ ...baseValues(), [campo]: valor });
    expect(result.success).toBe(true);
  });

  it("rechaza marca cuyo normalizado excede el tope aunque el crudo no lo exceda", () => {
    const result = modeloEquipoSchema.safeParse({
      ...baseValues(),
      marca: "ß".repeat(51), // crudo: 51 (≤100) — normalizado ('SS'): 102 (>100)
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = issueDe(result.error.issues, "marca");
    expect(issue?.code).toBe("custom");
  });

  it("acepta marca cuyo normalizado entra en el tope exacto (hermano invertido)", () => {
    const result = modeloEquipoSchema.safeParse({
      ...baseValues(),
      marca: "ß".repeat(50), // crudo: 50 — normalizado ('SS'): 100 (≤100)
    });
    expect(result.success).toBe(true);
  });

  it("preserva la capitalización de modelo (sin toUpperCase)", () => {
    const result = modeloEquipoSchema.safeParse({ ...baseValues(), modelo: "LaserJet Pro M404" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.modelo).toBe("LaserJet Pro M404");
  });

  it.each([
    ["marca", "   "],
    ["modelo", "   "],
  ] as const)("rechaza %s de solo espacios como requerido", (campo, valor) => {
    const result = modeloEquipoSchema.safeParse({ ...baseValues(), [campo]: valor });
    expect(result.success).toBe(false);
  });
});
