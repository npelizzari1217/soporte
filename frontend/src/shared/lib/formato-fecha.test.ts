import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aFechaInput,
  formatearFechaCalendario,
  formatearInstante,
  formatearInstanteComoDiaArgentino,
  hoyFechaCalendario,
} from "./formato-fecha";

/**
 * formato-fecha.test.ts — sdd/render-fechas-frontend WU1.
 *
 * Prueba de independencia de huso horario (diseño D2, reconciliación #2394
 * §4): una matriz ingenua con `describe.each` mutando `process.env.TZ`
 * pasaría en vacío si `Intl.DateTimeFormat` estuviera cacheado a scope de
 * módulo — resuelve la zona en el `import`, antes de que corra cualquier
 * test. Las capas estructurales de abajo (P1a/b/c) prueban el mecanismo de
 * fondo directamente; P2 mantiene la matriz de 4 zonas como red de
 * seguridad adicional, abriendo cada bloque con un canario que falla fuerte
 * si la zona ambiente no cambió de verdad.
 */

describe("reportarClasificacion — guardia cruzada entre clases (#2394 §1)", () => {
  it("formatearInstante tira excepción bajo NODE_ENV=test si recibe una fecha de calendario pelada", () => {
    expect(() => formatearInstante("2026-08-17")).toThrow(/parece una fecha de calendario/);
  });

  it("formatearInstanteComoDiaArgentino tira excepción bajo NODE_ENV=test si recibe una fecha de calendario pelada", () => {
    expect(() => formatearInstanteComoDiaArgentino("2026-08-17")).toThrow(/parece una fecha de calendario/);
  });

  it("formatearFechaCalendario tira excepción bajo NODE_ENV=test si recibe un instante que no es medianoche", () => {
    expect(() => formatearFechaCalendario("2026-08-17T17:30:00.000Z")).toThrow(/parece un instante/);
  });

  it("formatearFechaCalendario NO tira excepción para medianoche UTC exacta (la forma esperada de @db.Date)", () => {
    expect(() => formatearFechaCalendario("2026-08-17T00:00:00.000Z")).not.toThrow();
  });
});

describe("formatearInstante / formatearInstanteComoDiaArgentino — salida literal", () => {
  it("renderiza el formato unificado, año de 4 dígitos, sin puntuación de dateStyle/timeStyle", () => {
    expect(formatearInstante("2026-08-17T17:30:00.000Z")).toBe("17/08/2026 14:30");
  });

  it("renderiza el día de calendario argentino de un instante, reflejando diaArgentinoCsv", () => {
    expect(formatearInstanteComoDiaArgentino("2026-08-17T17:30:00.000Z")).toBe("17/08/2026");
  });

  it("cruza la medianoche correctamente: 23:59 UTC ya es el día siguiente a las 20:59 ART recién después de las 03:00 UTC", () => {
    // 2026-08-17T23:30:00.000Z -> Argentina 2026-08-17T20:30 (sigue siendo el mismo día)
    expect(formatearInstante("2026-08-17T23:30:00.000Z")).toBe("17/08/2026 20:30");
    // 2026-08-18T02:30:00.000Z -> Argentina 2026-08-17T23:30 (día anterior)
    expect(formatearInstante("2026-08-18T02:30:00.000Z")).toBe("17/08/2026 23:30");
  });
});

describe("formatearFechaCalendario — salida literal, nunca corre el día", () => {
  it("renderiza un input plano YYYY-MM-DD", () => {
    expect(formatearFechaCalendario("2026-08-17")).toBe("17/08/2026");
  });

  it("renderiza igual el datetime ISO equivalente en medianoche UTC", () => {
    expect(formatearFechaCalendario("2026-08-17T00:00:00.000Z")).toBe("17/08/2026");
  });

  it("null/undefined/vacío devuelven cadena vacía", () => {
    expect(formatearFechaCalendario(null)).toBe("");
    expect(formatearFechaCalendario(undefined)).toBe("");
    expect(formatearFechaCalendario("")).toBe("");
  });
});

describe("P1a — formatearFechaCalendario / aFechaInput nunca construyen un Date", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("igual devuelve el literal correcto cuando Date tira excepción al construirse", () => {
    class TrampaDate {
      constructor() {
        throw new Error("formatearFechaCalendario/aFechaInput nunca deberían construir un Date");
      }
    }
    vi.stubGlobal("Date", TrampaDate);

    expect(formatearFechaCalendario("2026-08-17T00:00:00.000Z")).toBe("17/08/2026");
    expect(aFechaInput("2026-08-17T00:00:00.000Z")).toBe("2026-08-17");
  });
});

describe("P1b — las opciones de Intl.DateTimeFormat siempre son explícitas", () => {
  // `vi.spyOn(Intl, "DateTimeFormat")` rompe este constructor nativo: el
  // call-through por defecto de tinyspy no preserva los internal slots que
  // necesita `Intl.DateTimeFormat`, así que el objeto devuelto pierde
  // `formatToParts`. Heredar del constructor nativo (soportado por la spec:
  // `Intl.DateTimeFormat` es explícitamente subclasseable) preserva el
  // comportamiento completo y a la vez registra cada llamada al constructor.
  const original = Intl.DateTimeFormat;

  afterEach(() => {
    Object.defineProperty(Intl, "DateTimeFormat", { value: original, configurable: true, writable: true });
  });

  function espiarConstructor(): Array<[string | string[] | undefined, Intl.DateTimeFormatOptions | undefined]> {
    const llamadas: Array<[string | string[] | undefined, Intl.DateTimeFormatOptions | undefined]> = [];
    class DateTimeFormatEspia extends Intl.DateTimeFormat {
      constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
        super(locales, options);
        llamadas.push([locales, options]);
      }
    }
    Object.defineProperty(Intl, "DateTimeFormat", { value: DateTimeFormatEspia, configurable: true, writable: true });
    return llamadas;
  }

  it("formatearInstante nunca deja la zona implícita y nunca usa dateStyle/timeStyle", () => {
    const llamadas = espiarConstructor();

    formatearInstante("2026-08-17T17:30:00.000Z");

    expect(llamadas).toHaveLength(1);
    const [locale, opciones] = llamadas[0];
    expect(locale).toBe("es-AR");
    expect(opciones).toMatchObject({ timeZone: "America/Argentina/Buenos_Aires", hour12: false });
    expect(opciones).not.toHaveProperty("dateStyle");
    expect(opciones).not.toHaveProperty("timeStyle");
  });

  it("formatearInstanteComoDiaArgentino nunca deja la zona implícita", () => {
    const llamadas = espiarConstructor();

    formatearInstanteComoDiaArgentino("2026-08-17T17:30:00.000Z");

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][1]).toMatchObject({ timeZone: "America/Argentina/Buenos_Aires" });
  });
});

describe("hoyFechaCalendario — fixed -3 offset (moved from features/compras/lib/fecha.ts)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mediodía UTC: mismo día calendario en Argentina (UTC-3) y en UTC", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    expect(hoyFechaCalendario()).toBe("2026-03-15");
  });

  it("borde: 23:30 UTC todavía es 20:30 en Argentina — sigue siendo el día UTC, no D+1", () => {
    vi.setSystemTime(new Date("2026-03-15T23:30:00.000Z"));
    expect(hoyFechaCalendario()).toBe("2026-03-15");
  });

  it("borde: 02:30 UTC del día siguiente es 23:30 del día ANTERIOR en Argentina — NO adelanta al día UTC", () => {
    vi.setSystemTime(new Date("2026-03-16T02:30:00.000Z"));
    expect(hoyFechaCalendario()).toBe("2026-03-15");
  });

  it("borde (hermano invertido): 03:00:01 UTC ya es 00:00:01 del día siguiente en Argentina", () => {
    vi.setSystemTime(new Date("2026-03-16T03:00:01.000Z"));
    expect(hoyFechaCalendario()).toBe("2026-03-16");
  });

  // P1c — límite exacto de milisegundo, según diseño D2/#2394 §4.
  it("P1c: 02:59:59.999Z todavía es el día ANTERIOR en Argentina", () => {
    vi.setSystemTime(new Date("2026-08-17T02:59:59.999Z"));
    expect(hoyFechaCalendario()).toBe("2026-08-16");
  });

  it("P1c: 03:00:00.000Z pasa al MISMO día en Argentina", () => {
    vi.setSystemTime(new Date("2026-08-17T03:00:00.000Z"));
    expect(hoyFechaCalendario()).toBe("2026-08-17");
  });
});

describe("aFechaInput — normalizes to <input type=\"date\"> shape (moved from features/compras/lib/fecha.ts)", () => {
  it("recorta el datetime ISO del backend a la fecha de calendario que espera <input type=\"date\">", () => {
    expect(aFechaInput("2026-08-17T00:00:00.000Z")).toBe("2026-08-17");
  });

  it("NO desplaza el día: la fecha sale igual corra donde corra el navegador (no parsea con new Date)", () => {
    expect(aFechaInput("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
  });

  it("es idempotente: una fecha ya en formato de input vuelve igual", () => {
    expect(aFechaInput("2026-08-17")).toBe("2026-08-17");
  });

  it("null/undefined/vacío devuelven cadena vacía (input sin precargar, no 'Invalid Date')", () => {
    expect(aFechaInput(null)).toBe("");
    expect(aFechaInput(undefined)).toBe("");
    expect(aFechaInput("")).toBe("");
  });
});

/**
 * P2 — matriz de 4 zonas, cada bloque abre con un canario que confirma que
 * la zona ambiente cambió de verdad. Fallback pre-aprobado por diseño si
 * este canario falla en Windows: mover la dimensión al límite del proceso
 * vía `scripts/test-tz.mjs` (tarea 1.11). Se deja activo acá primero — ver
 * el reporte de WU1 para si hizo falta ese fallback.
 */
// ICU canonicaliza algunos identificadores IANA a un alias legacy al resolver
// la zona ambiente SIN una opción `timeZone` explícita — observado en esta
// máquina para "America/Argentina/Buenos_Aires" -> "America/Buenos_Aires"
// (mismo offset, link de tzdata). Esto afecta solo la lectura de zona ambiente
// del canario, nunca al módulo bajo prueba, que siempre pasa
// `timeZone: ZONA_ARGENTINA` explícitamente (ver P1b).
const ALIAS_ZONA_ICU: Record<string, string> = {
  "America/Argentina/Buenos_Aires": "America/Buenos_Aires",
};

describe.each(["Pacific/Kiritimati", "Pacific/Midway", "UTC", "America/Argentina/Buenos_Aires"])(
  "P2 — independencia de huso, TZ ambiente = %s",
  (zonaAmbiente) => {
    let tzOriginal: string | undefined;

    beforeEach(() => {
      tzOriginal = process.env.TZ;
      process.env.TZ = zonaAmbiente;
    });

    afterEach(() => {
      if (tzOriginal === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = tzOriginal;
      }
    });

    it("canary: la zona ambiente realmente cambió", () => {
      const zonasAceptadas = [zonaAmbiente, ALIAS_ZONA_ICU[zonaAmbiente]].filter(Boolean);
      expect(zonasAceptadas).toContain(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it("formatearInstante es idéntico byte a byte sin importar el TZ ambiente", () => {
      expect(formatearInstante("2026-08-17T17:30:00.000Z")).toBe("17/08/2026 14:30");
    });

    it("formatearFechaCalendario nunca desplaza el día", () => {
      expect(formatearFechaCalendario("2026-08-17")).toBe("17/08/2026");
      expect(formatearFechaCalendario("2026-08-17T00:00:00.000Z")).toBe("17/08/2026");
    });
  },
);
