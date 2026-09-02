import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { obtenerCatalogoZonasHorarias } from "./zonas-horarias";

/**
 * Catálogo de zonas horarias — solo la AYUDA VISUAL del combobox, nunca la
 * fuente de validez (esa es `esZonaValida`, `shared/lib/formato-fecha.ts`).
 *
 * Los dos primeros tests fijan `America/Argentina/Buenos_Aires` y `UTC` POR
 * NOMBRE, no derivándolos de `Intl.supportedValuesOf('timeZone')`: ese
 * catálogo nativo (418 zonas en Node 24.20.0, medido) no trae ninguna de las
 * dos, y es justo lo que este catálogo tiene que corregir.
 */
const RUTA_FIXTURE = join(__dirname, "../../../../shared-fixtures/formato-fecha-paridad.json");

function cargarZonasValidasDelFixture(): string[] {
  const fixture = JSON.parse(readFileSync(RUTA_FIXTURE, "utf-8")) as { zonasValidas: string[] };
  return fixture.zonasValidas;
}

/**
 * Único candidato de `zonasValidas` que queda deliberadamente fuera del
 * catálogo: `+05:00` es un offset ISO, no un nombre de zona IANA — ver el
 * porqué completo en `zonas-horarias.ts`. Centinela fijo, independiente del
 * catálogo: si una futura regresión saca a Kolkata o a Etc/GMT+5 de
 * `ZONAS_FALTANTES_EN_INTL`, este assert lo atrapa por diferir del valor
 * esperado, en vez de que el conteo de exclusiones crezca en silencio.
 */
const EXCLUSION_ESPERADA_DEL_FIXTURE = ["+05:00"];
describe("obtenerCatalogoZonasHorarias", () => {
  it("incluye America/Argentina/Buenos_Aires aunque Intl.supportedValuesOf('timeZone') no la traiga", () => {
    expect(Intl.supportedValuesOf("timeZone")).not.toContain("America/Argentina/Buenos_Aires");
    expect(obtenerCatalogoZonasHorarias()).toContain("America/Argentina/Buenos_Aires");
  });

  it("incluye UTC aunque Intl.supportedValuesOf('timeZone') no la traiga", () => {
    expect(Intl.supportedValuesOf("timeZone")).not.toContain("UTC");
    expect(obtenerCatalogoZonasHorarias()).toContain("UTC");
  });

  it("no tiene zonas duplicadas", () => {
    const catalogo = obtenerCatalogoZonasHorarias();
    expect(new Set(catalogo).size).toBe(catalogo.length);
  });

  it("está ordenado alfabéticamente", () => {
    const catalogo = obtenerCatalogoZonasHorarias();
    const copiaOrdenada = [...catalogo].sort((a, b) => a.localeCompare(b));
    expect(catalogo).toEqual(copiaOrdenada);
  });

  it("cubre todas las zonasValidas del fixture compartido, salvo el offset ISO declarado como excepción", () => {
    const catalogo = obtenerCatalogoZonasHorarias();
    const zonasValidasFueraDelCatalogo = cargarZonasValidasDelFixture().filter((zona) => !catalogo.includes(zona));

    expect(zonasValidasFueraDelCatalogo).toEqual(EXCLUSION_ESPERADA_DEL_FIXTURE);
  });
});
