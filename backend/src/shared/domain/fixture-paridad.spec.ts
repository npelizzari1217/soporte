/**
 * Guard de alcance del fixture compartido `shared-fixtures/formato-fecha-paridad.json`.
 *
 * `shared-fixtures/` es un directorio nuevo en la raíz del monorepo, fuera de
 * `src/` y del `rootDir` de este paquete. Se lee con `readFileSync` + `JSON.parse`
 * en vez de un `import` estático de JSON: un `import data from '...json'` resuelve
 * bien en Vitest (Vite no aplica ninguna restricción de `fs.allow` a esta ruta),
 * pero `tsc --noEmit -p tsconfig.typecheck.json` lo rechaza con
 * `TS2732: Cannot find module ... Consider using '--resolveJsonModule'`, porque
 * `resolveJsonModule` no está habilitado en `tsconfig.json`. Se prefirió no tocar
 * esa config global por un solo fixture: `readFileSync` no pasa por resolución de
 * módulos de TypeScript, así que no depende de esa flag y no arriesga otros
 * efectos del flag en el resto del build. Verificado empíricamente antes de
 * escribir este test (probe descartado, no versionado).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const RUTA_FIXTURE = join(__dirname, '../../../../shared-fixtures/formato-fecha-paridad.json');

function cargarFixture(): FixtureParidad {
  return JSON.parse(readFileSync(RUTA_FIXTURE, 'utf-8')) as FixtureParidad;
}

describe('shared-fixtures/formato-fecha-paridad.json — alcanzable desde la suite backend', () => {
  it('trae los bloques zonasValidas, zonasInvalidas y casos', () => {
    const fixture = cargarFixture();

    expect(fixture).toHaveProperty('zonasValidas');
    expect(fixture).toHaveProperty('zonasInvalidas');
    expect(fixture).toHaveProperty('casos');
    expect(Array.isArray(fixture.zonasValidas)).toBe(true);
    expect(Array.isArray(fixture.zonasInvalidas)).toBe(true);
    expect(Array.isArray(fixture.casos)).toBe(true);
  });

  it('zonasValidas incluye America/Argentina/Buenos_Aires y Europe/Madrid', () => {
    const fixture = cargarFixture();

    expect(fixture.zonasValidas).toContain('America/Argentina/Buenos_Aires');
    expect(fixture.zonasValidas).toContain('Europe/Madrid');
  });
});
