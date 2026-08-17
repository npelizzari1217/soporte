import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoyISO } from "./fecha";

/**
 * fecha.test.ts — fix post-verify W4/W5 (sdd/compras-tres-etapas-y-sectores).
 *
 * `hoyISO()` no tenía NINGÚN test propio: `registrar-avance-dialog.test.tsx`
 * la importaba de la implementación y afirmaba contra `hoyISO()` — pasaba
 * por construcción, cualquiera fuera el comportamiento real (el mismo
 * patrón que "el test consagra el síntoma"). Este archivo fija el reloj del
 * sistema (`vi.setSystemTime`) y compara contra un LITERAL calculado a mano,
 * nunca contra la función bajo test.
 *
 * Los dos casos de borde (`23:30 UTC` y `03:00 UTC`) son los que
 * distinguían la regla VIEJA (huso local del proceso, acá `Europe/Madrid`
 * en la máquina de desarrollo) de la NUEVA (offset fijo de Argentina,
 * idéntica a `fecha-argentina.ts:hoyArgentina` del backend) — con la regla
 * vieja, ambos casos daban una fecha de calendario distinta a la de acá.
 */
describe("hoyISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mediodía UTC: mismo día calendario en Argentina (UTC-3) y en UTC", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    expect(hoyISO()).toBe("2026-03-15");
  });

  it("borde: 23:30 UTC todavía es 20:30 en Argentina — sigue siendo el día UTC, no D+1", () => {
    vi.setSystemTime(new Date("2026-03-15T23:30:00.000Z"));

    expect(hoyISO()).toBe("2026-03-15");
  });

  it("borde: 02:30 UTC del día siguiente es 23:30 del día ANTERIOR en Argentina — NO adelanta al día UTC", () => {
    vi.setSystemTime(new Date("2026-03-16T02:30:00.000Z"));

    expect(hoyISO()).toBe("2026-03-15");
  });

  it("borde (hermano invertido): 03:00:01 UTC ya es 00:00:01 del día siguiente en Argentina", () => {
    vi.setSystemTime(new Date("2026-03-16T03:00:01.000Z"));

    expect(hoyISO()).toBe("2026-03-16");
  });
});
