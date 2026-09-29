import { describe, expect, it } from "vitest";
import { DIAS_POR_SEMANA, MINUTOS_POR_DIA } from "./limites";

/**
 * Centinela de VALOR: estas constantes son una copia a mano de
 * `horario-laboral.constants.ts` (backend). Atrapa una edición accidental
 * acá; no atrapa un cambio del lado del backend (ver el comentario de
 * `limites.ts`).
 */
describe("limites — centinela contra horario-laboral.constants.ts (backend)", () => {
  it("DIAS_POR_SEMANA coincide con la autoridad del backend", () => {
    expect(DIAS_POR_SEMANA).toBe(7);
  });

  it("MINUTOS_POR_DIA coincide con la autoridad del backend", () => {
    expect(MINUTOS_POR_DIA).toBe(1440);
  });
});
