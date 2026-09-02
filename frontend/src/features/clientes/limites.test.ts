import { describe, expect, it } from "vitest";
import { CLIENTE_ZONA_HORARIA_MAX_LENGTH } from "./limites";

/**
 * Centinela de tope — `CLIENTE_ZONA_HORARIA_MAX_LENGTH` (D8, tarea 2.11,
 * `openspec/changes/zona-horaria-por-tenant/tasks.md`).
 *
 * Fija el 64 contra un valor INDEPENDIENTE, no derivado de la propia
 * constante: si alguien la sube a 500 sin darse cuenta, este assert lo
 * detecta — un `"a".repeat(MAX_LENGTH + 1)` no lo haría, porque ese patrón
 * se autoajusta al valor nuevo. Mismo criterio que el centinela del VO
 * backend (`backend/src/shared/domain/zona-horaria.spec.ts`, describe
 * "centinela de tope — ZONA_HORARIA_MAX_LENGTH").
 *
 * Nació en rojo con la tarea 2.11 (la constante era un placeholder) y la
 * tarea 2.13 la puso en 64. El assert sigue fijo contra el literal a
 * propósito: es lo que detecta que alguien la mueva.
 */
describe("CLIENTE_ZONA_HORARIA_MAX_LENGTH — centinela de tope (D8)", () => {
  it("es 64, espejando ZONA_HORARIA_MAX_LENGTH del VO backend (columna zona_horaria VARCHAR(64))", () => {
    expect(CLIENTE_ZONA_HORARIA_MAX_LENGTH).toBe(64);
  });
});
