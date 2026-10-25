/**
 * runbook-migraciones.spec.ts — guarda del checklist combinado del deploy del 2026-10-25.
 *
 * La sección "## Deploy del 2026-10-25: checklist combinado" de DEPLOY-VPS-runbook.md es el
 * orden único de la ventana: enumera las migraciones tenant del release, su orden de aplicación
 * y su rollback. Se escribió antes de integrar `feat/historial-valor-residual` y omitió su
 * migración: una rama que entra después a la integración agrega una migración y nadie vuelve a
 * la lista. Este spec falla si una migración tenant del release no aparece por nombre en la
 * sección.
 *
 * El rango va de la primera migración del release (`20261024120000`) a la última
 * (`20261025140000`): las anteriores ya estaban desplegadas, y las posteriores son de releases
 * siguientes, documentados en sus propias secciones.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const directorioMigraciones = resolve(repoRoot, 'backend', 'prisma_tenant', 'migrations');
const PRIMERA_MIGRACION_DEL_RELEASE = '20261024120000';
/** Timestamp de la última migración del release; el nombre completo la incluye por el sufijo. */
const ULTIMA_MIGRACION_DEL_RELEASE = '20261025140000';
const ENCABEZADO = '## Deploy del 2026-10-25: checklist combinado';

/**
 * Devuelve la sección del checklist combinado: desde su encabezado hasta el siguiente
 * encabezado de nivel 2, o hasta el final del archivo.
 *
 * @param runbook - Contenido completo de DEPLOY-VPS-runbook.md.
 * @returns El texto de la sección, encabezado incluido.
 */
function extraerSeccion(runbook: string): string {
  const inicio = runbook.indexOf(ENCABEZADO);
  if (inicio === -1) {
    throw new Error(`No se encontró la sección "${ENCABEZADO}" en DEPLOY-VPS-runbook.md`);
  }
  const fin = runbook.indexOf('\n## ', inicio + ENCABEZADO.length);
  return fin === -1 ? runbook.slice(inicio) : runbook.slice(inicio, fin);
}

const seccion = extraerSeccion(readFileSync(resolve(repoRoot, 'DEPLOY-VPS-runbook.md'), 'utf8'));

const migracionesDelRelease = readdirSync(directorioMigraciones, { withFileTypes: true })
  .filter(
    (entrada) =>
      entrada.isDirectory() &&
      entrada.name >= PRIMERA_MIGRACION_DEL_RELEASE &&
      entrada.name.slice(0, ULTIMA_MIGRACION_DEL_RELEASE.length) <= ULTIMA_MIGRACION_DEL_RELEASE,
  )
  .map((entrada) => entrada.name)
  .sort();

describe('DEPLOY-VPS-runbook.md — checklist combinado del deploy del 2026-10-25', () => {
  it('encuentra migraciones tenant del release para verificar', () => {
    expect(migracionesDelRelease).toContain('20261024120000_ticket_unificado');
    expect(migracionesDelRelease).toContain('20261025140000_historial_valor_residual');
  });

  it('deja afuera las migraciones de releases posteriores', () => {
    expect(migracionesDelRelease).not.toContain('20261025150000_retiro_satelite_edilicia');
  });

  it('la sección termina antes del siguiente encabezado de nivel 2', () => {
    expect(seccion.startsWith(ENCABEZADO)).toBe(true);
    expect(seccion).not.toContain('\n## ');
  });

  it.each(migracionesDelRelease)('nombra la migración %s', (migracion) => {
    expect(seccion).toContain(migracion);
  });
});
