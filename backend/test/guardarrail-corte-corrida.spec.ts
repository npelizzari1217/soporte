/**
 * Prueba de CORTE, no de contenido: un unitario no puede demostrar que el
 * `globalSetup` realmente aborta la corrida COMPLETA de Vitest — eso pasa
 * fuera de proceso (ver design sdd/regeneracion-reproducible D2 capa 2).
 * Este test lanza un Vitest HIJO de verdad contra el fixture mínimo, con
 * `DATABASE_URL_MASTER` envenenada, y verifica:
 *   1. el proceso hijo termina con exit ≠ 0,
 *   2. stderr nombra el guardarraíl,
 *   3. stdout NO contiene el marcador del fixture — la prueba de que
 *      ningún spec llegó a correr, no solo de que uno falló.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const vitestPkgJson = require.resolve('vitest/package.json') as string;
const vitestBin = path.join(
  path.dirname(vitestPkgJson),
  (require(vitestPkgJson) as { bin: { vitest: string } }).bin.vitest,
);

const RAIZ_FIXTURE = path.join(__dirname, 'fixtures', 'guardarrail');
const MARCADOR = 'MARCADOR_GUARDARRAIL_FIXTURE_OK';

/** Corre el Vitest hijo y devuelve exit/stdout/stderr sin importar si tiró o no. */
function correrVitestHijo(envExtra: Record<string, string>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(
      process.execPath,
      // --reporter=verbose: el reporter por defecto no imprime console.log de
      // tests que pasan, y necesitamos ver el marcador cuando SÍ corren.
      [vitestBin, 'run', '--root', RAIZ_FIXTURE, '--reporter=verbose'],
      {
        env: { ...process.env, ...envExtra },
        encoding: 'utf8',
      },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? null, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('corte de la corrida ante host remoto', () => {
  it('aborta antes de correr cualquier spec del fixture', () => {
    const resultado = correrVitestHijo({
      DATABASE_URL_MASTER: 'postgresql://usuario:clave@10.0.0.5:5432/db_remota',
    });

    expect(resultado.status).not.toBe(0);
    expect(resultado.stderr).toContain('guardarrail-host');
    expect(resultado.stdout).not.toContain(MARCADOR);
  });

  it('control: con la URL local el fixture corre y el marcador SÍ aparece', () => {
    const resultado = correrVitestHijo({
      DATABASE_URL_MASTER: 'postgresql://usuario:clave@localhost:5432/db_local',
    });

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain(MARCADOR);
  });
});
