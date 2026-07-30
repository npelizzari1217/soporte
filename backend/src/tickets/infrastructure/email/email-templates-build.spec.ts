/**
 * Test REAL de la copia de `.hbs` a `dist/` — ejecuta `copyfiles` (el mismo
 * paquete que usa el script `build`) con los parámetros REALES extraídos de
 * `package.json`, contra un directorio temporal, y compara la ubicación
 * resultante con `TEMPLATES_ROOT` (importado del adapter — NO hardcodeado)
 * resuelto de forma equivalente a como se resuelve en `dist/`.
 *
 * Contexto (issue CRITICAL, Judgment Day Ronda 1 + WARNING, Ronda 2): la
 * versión anterior de este test solo hacía regex-match sobre el STRING del
 * script `build` — quedaba verde aunque alguien cambiara la profundidad de
 * `TEMPLATES_ROOT` o el `-u N` de forma inconsistente entre sí, reintroduciendo
 * el ENOENT de producción sin que ningún test lo detectara.
 *
 * Este test FALLA si esa correspondencia se rompe, porque:
 *   1. parsea el paso `copyfiles -u N "<glob>" <dest>` REAL del script build
 *      (sin asumir valores fijos),
 *   2. ejecuta `copyfiles` (la librería, no un mock) con esos parámetros
 *      reales contra un `tmpDir`,
 *   3. deriva — con `path.relative`, no con un string hardcodeado — la ruta
 *      relativa que `TEMPLATES_ROOT` (importado del adapter real) ocuparía
 *      dentro de ese `tmpDir` si fuera la raíz de `dist/`, y
 *   4. verifica que el archivo copiado por la ejecución real de `copyfiles`
 *      cae exactamente ahí.
 *
 * `tsc` en sí (compilar TS a JS) no se ejecuta acá — sería redundante y
 * costoso; lo único que hace falta probar es que el PASO DE COPIA reproduce
 * la estructura de directorios que `TEMPLATES_ROOT` espera, y eso se prueba
 * con la copia real.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import copyFiles from 'copyfiles';
import { TEMPLATES_ROOT } from './nodemailer-email-sender.adapter';

const BACKEND_ROOT = path.join(__dirname, '..', '..', '..', '..');
const packageJsonPath = path.join(BACKEND_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
  scripts: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Extrae `copyfiles -u <N> "<glob>" <dest>` del script `build` REAL — sin
 * asumir valores fijos. Si el script cambia de forma que ya no matchea esta
 * forma, el test debe fallar acá (señal clara de que el paso de copia
 * desapareció o cambió de forma inesperada), no seguir con valores viejos.
 */
function parseCopyfilesStep(buildScript: string): { glob: string; up: number; dest: string } {
  const match = buildScript.match(/copyfiles\s+-u\s*(\d+)\s+"([^"]+)"\s+(\S+)/);
  if (!match) {
    throw new Error(
      'No se encontró un paso "copyfiles -u N \\"<glob>\\" <dest>" en el script "build" de package.json',
    );
  }
  const [, upRaw, glob, dest] = match;
  return { up: Number(upRaw), glob, dest };
}

describe('build script — copia de email-templates/*.hbs a dist/', () => {
  it('declara "copyfiles" como devDependency (herramienta cross-platform Windows/Linux elegida)', () => {
    expect(pkg.devDependencies?.copyfiles).toBeDefined();
  });

  it(
    'ejecuta copyfiles con los parámetros reales de "build" y el .hbs copiado cae ' +
      'exactamente en la ruta que TEMPLATES_ROOT (del adapter real) espera',
    async () => {
      const { glob, up } = parseCopyfilesStep(pkg.scripts.build);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copyfiles-build-spec-'));
      // El script real corre `copyfiles -u N "<glob relativo>" dist` con
      // cwd=backend/ (pnpm ejecuta scripts desde la raíz del package). El
      // recorte `-u N` de copyfiles opera sobre la forma del path que
      // matchea el glob — si el glob es relativo, los matches son
      // relativos. Para que la copia se comporte IGUAL que en producción
      // (y no distinto por comparar rutas absolutas), replicamos ese mismo
      // cwd acá en vez de pasar un glob absoluto.
      const originalCwd = process.cwd();
      process.chdir(BACKEND_ROOT);
      try {
        await new Promise<void>((resolve, reject) => {
          copyFiles([glob, tmpDir], { up }, (err?: Error) => {
            if (err) return reject(err);
            resolve();
          });
        });

        // TEMPLATES_ROOT real (del adapter) resuelto relativo a la raíz de
        // `src/` — tsc mirror-ea esa MISMA estructura relativa dentro de
        // `dist/`, así que esta ruta relativa es la que el runtime real
        // busca una vez compilado. Path math real, no un string literal.
        const SRC_ROOT = path.join(__dirname, '..', '..', '..');
        const templatesRootRelative = path.relative(SRC_ROOT, TEMPLATES_ROOT);

        const subjectCopiado = path.join(
          tmpDir,
          templatesRootRelative,
          'cambio-estado',
          'subject.hbs',
        );
        const bodyCopiado = path.join(tmpDir, templatesRootRelative, 'cambio-estado', 'body.hbs');

        expect(fs.existsSync(subjectCopiado)).toBe(true);
        expect(fs.existsSync(bodyCopiado)).toBe(true);
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
