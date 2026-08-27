/**
 * Prueba de CORTE, no de contenido — mismo patrón que
 * `guardarrail-corte-corrida.spec.ts` (ver design sdd/fail-fast-env ADR-E3),
 * con una diferencia decisiva: acá hay que QUITAR una variable requerida, no
 * agregar una envenenada. `env: { ...process.env, ...envExtra }` nunca borra
 * una clave heredada — por eso el entorno del hijo se arma por EXCLUSIÓN
 * (`delete`), completando las otras dos variables requeridas con valores
 * válidos para aislar la variable bajo prueba. Un spread solo no alcanza:
 * este test nunca podría ir a RED con esa forma.
 *
 * El fixture (`test/fixtures/entorno/`) NO hereda `setupFiles` ni
 * `globalSetup` del padre — tiene su propio `vitest.config.mjs` sin esas
 * claves. Si heredara `setupFiles`, el `??=` repondría la variable faltante
 * y el corte jamás ocurriría.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const vitestPkgJson = require.resolve('vitest/package.json') as string;
const vitestBin = path.join(
  path.dirname(vitestPkgJson),
  (require(vitestPkgJson) as { bin: { vitest: string } }).bin.vitest,
);

const RAIZ_FIXTURE = path.join(__dirname, 'fixtures', 'entorno');
const MARCADOR = 'MARCADOR_ENTORNO_FIXTURE_OK';

/** Valores válidos de las 3 variables requeridas, para completar el entorno del hijo. */
const VALORES_VALIDOS: Record<string, string> = {
  DATABASE_URL_MASTER: 'postgresql://usuario:clave@localhost:5432/db_valida',
  APP_BASE_URL: 'http://localhost:5173',
  JWT_SECRET: 'jwt-secret-de-test-fixture',
};

/**
 * Corre el Vitest hijo con el entorno armado por EXCLUSIÓN: parte de
 * `process.env`, completa las 3 variables requeridas con valores válidos y
 * borra `claveAusente` (si se pasa una). Devuelve exit/stdout/stderr sin
 * importar si el proceso hijo tiró o no.
 */
function correrVitestHijoSinVariable(claveAusente: string | null): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const env: Record<string, string | undefined> = { ...process.env, ...VALORES_VALIDOS };
  if (claveAusente) {
    delete env[claveAusente];
  }

  try {
    const stdout = execFileSync(
      process.execPath,
      // --reporter=verbose: el reporter por defecto no imprime console.log de
      // tests que pasan, y necesitamos ver el marcador cuando SÍ corren.
      [vitestBin, 'run', '--root', RAIZ_FIXTURE, '--reporter=verbose'],
      { env, encoding: 'utf8' },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? null, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('corte de arranque ante variable de entorno requerida ausente', () => {
  it.each(['DATABASE_URL_MASTER', 'APP_BASE_URL', 'JWT_SECRET'])(
    'aborta antes de correr el fixture cuando falta %s',
    (claveAusente) => {
      const resultado = correrVitestHijoSinVariable(claveAusente);

      expect(resultado.status).not.toBe(0);
      // El prefijo va junto con la clave a propósito: `status !== 0` y la
      // ausencia del marcador los satisface CUALQUIER fallo del hijo, así que
      // sin anclar el mensaje del guard un stack trace que mencione la
      // variable de paso dejaría pasar el test por el motivo equivocado.
      expect(resultado.stderr).toContain('[config-entorno] Falta configurar');
      expect(resultado.stderr).toContain(claveAusente);
      expect(resultado.stdout).not.toContain(MARCADOR);
    },
  );

  it('control: con las 3 variables presentes el fixture corre y el marcador SÍ aparece', () => {
    const resultado = correrVitestHijoSinVariable(null);

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain(MARCADOR);
  });
});
