/**
 * Guard de alcance del fixture compartido `shared-fixtures/formato-fecha-paridad.json`
 * desde la suite frontend. Ver el comentario gemelo en
 * `backend/src/shared/domain/fixture-paridad.spec.ts` para el porqué de leerlo con
 * `readFileSync` + `JSON.parse` en vez de un `import` estático: acá `resolveJsonModule`
 * de `moduleResolution: "bundler"` sí resolvería el import en Vite, pero se mantiene la
 * misma vía que el backend a propósito — es un solo mecanismo, no dos, para el mismo
 * fixture compartido.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface FixtureParidad {
  zonasValidas: string[];
  zonasInvalidas: string[];
  casos: Array<{
    instante: string;
    zona: string;
    esperadoInstante: string;
    esperadoDia: string;
    esperadoHoy: string;
  }>;
}

const RUTA_FIXTURE = join(__dirname, "../../../../shared-fixtures/formato-fecha-paridad.json");

function cargarFixture(): FixtureParidad {
  return JSON.parse(readFileSync(RUTA_FIXTURE, "utf-8")) as FixtureParidad;
}

describe("shared-fixtures/formato-fecha-paridad.json — alcanzable desde la suite frontend", () => {
  it("trae los bloques zonasValidas, zonasInvalidas y casos", () => {
    const fixture = cargarFixture();

    expect(fixture).toHaveProperty("zonasValidas");
    expect(fixture).toHaveProperty("zonasInvalidas");
    expect(fixture).toHaveProperty("casos");
    expect(Array.isArray(fixture.zonasValidas)).toBe(true);
    expect(Array.isArray(fixture.zonasInvalidas)).toBe(true);
    expect(Array.isArray(fixture.casos)).toBe(true);
  });

  it("zonasValidas incluye America/Argentina/Buenos_Aires y Europe/Madrid", () => {
    const fixture = cargarFixture();

    expect(fixture.zonasValidas).toContain("America/Argentina/Buenos_Aires");
    expect(fixture.zonasValidas).toContain("Europe/Madrid");
  });
});
