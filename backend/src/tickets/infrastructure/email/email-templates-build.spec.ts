/**
 * Smoke test — el script `build` de package.json copia los `.hbs` de
 * `email-templates/` a `dist/` en la ruta que `TEMPLATES_ROOT` espera en
 * runtime.
 *
 * Contexto (issue CRITICAL, Judgment Day Ronda 1): `tsc` NO copia assets
 * no-TypeScript (`.hbs`) a `dist/`. `TEMPLATES_ROOT` en
 * `nodemailer-email-sender.adapter.ts` es
 * `path.join(__dirname, '..', 'email-templates')` — con el adapter
 * compilado en `dist/tickets/infrastructure/email/*.js`, eso resuelve a
 * `dist/tickets/infrastructure/email-templates`. Sin un paso de copia
 * explícito en `build`, todo email `type: 'template'` falla con ENOENT
 * en producción.
 *
 * Correr el build completo (`tsc` + `tsc-alias`) en un test unitario es
 * costoso (varios segundos) — en su lugar se verifica que el script
 * declarado en package.json efectivamente copia `email-templates/**\/*.hbs`
 * hacia la ruta `dist/tickets/infrastructure/email-templates` que
 * `TEMPLATES_ROOT` espera. La verificación "real" (build end-to-end) se
 * documenta y corre manualmente — ver STATE.md.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('build script — copia de email-templates/*.hbs a dist/', () => {
  const packageJsonPath = path.join(__dirname, '..', '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
    scripts: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it('declara "copyfiles" como devDependency (herramienta cross-platform Windows/Linux elegida)', () => {
    expect(pkg.devDependencies?.copyfiles).toBeDefined();
  });

  it('el script "build" incluye un paso que copia los .hbs de email-templates/ hacia dist/', () => {
    const buildScript = pkg.scripts.build;

    expect(buildScript).toMatch(/copyfiles/);
    expect(buildScript).toMatch(/email-templates/);
    expect(buildScript).toMatch(/\*\.hbs/);
  });

  it('el destino de la copia coincide con la ruta que TEMPLATES_ROOT resuelve en dist/ (dist/tickets/infrastructure/email-templates)', () => {
    const buildScript = pkg.scripts.build;

    // TEMPLATES_ROOT = path.join(__dirname, '..', 'email-templates') sobre
    // el adapter compilado en dist/tickets/infrastructure/email/*.js ⇒
    // TEMPLATES_ROOT real = dist/tickets/infrastructure/email-templates.
    // copyfiles -u N recorta N segmentos del path de origen ("src") antes
    // de anteponer el destino — el resultado debe mirror-ear exactamente
    // esa ruta.
    expect(buildScript).toMatch(/src\/tickets\/infrastructure\/email-templates/);
    expect(buildScript).toMatch(/-u\s*1/);
    expect(buildScript).toMatch(/copyfiles[^&]*\bdist\b/);
  });
});
