/**
 * higiene-every.spec.ts — verificación ESTRUCTURAL (PR-22, sdd/redisenio-modulo-compras):
 * `.every(` no aparece en ningún archivo de implementación de `compras/`
 * fuera de `domain/services/estado-compra.ts`.
 *
 * ADR-C1 (design) es explícito: la excepción al cuantificador universal
 * (`nA=0 ⇒ comprado=false && cerrado=false`, confirmada por el usuario en la
 * spec §3) vive en UN único lugar — `derivarEstadoCompra`
 * (`estado-compra.ts`). Si `.every()` reaparece en otro archivo, es una
 * segunda implementación de la tabla de verdad que puede DIVERGIR de la
 * excepción de vacuidad — exactamente el bug que ADR-C1 diseñó para
 * imposibilitar.
 *
 * Alcance: solo código de IMPLEMENTACIÓN (`.ts`, excluyendo `*.spec.ts`/
 * `*.integration.spec.ts`) — un comentario de test que MENCIONA `.every()`
 * en prosa (ver `estado-compra.spec.ts`) no es una segunda implementación,
 * así que queda fuera del escaneo a propósito.
 *
 * Ref design: ADR-C1. Ref tasks: PR-22.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ_COMPRAS = join(__dirname);
const ARCHIVO_PERMITIDO = join('domain', 'services', 'estado-compra.ts');

function esArchivoDeImplementacion(nombre: string): boolean {
  return nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') && !nombre.endsWith('.d.ts');
}

function listarArchivosTs(dir: string): string[] {
  const entradas = readdirSync(dir);
  const archivos: string[] = [];
  for (const entrada of entradas) {
    const rutaAbsoluta = join(dir, entrada);
    const info = statSync(rutaAbsoluta);
    if (info.isDirectory()) {
      archivos.push(...listarArchivosTs(rutaAbsoluta));
    } else if (esArchivoDeImplementacion(entrada)) {
      archivos.push(rutaAbsoluta);
    }
  }
  return archivos;
}

describe('Higiene estructural — .every() está confinado a estado-compra.ts (ADR-C1)', () => {
  it('ningún archivo de implementación de compras/ fuera de estado-compra.ts usa .every(', () => {
    const archivos = listarArchivosTs(RAIZ_COMPRAS);
    const infractores: string[] = [];

    for (const archivo of archivos) {
      const rutaRelativa = relative(RAIZ_COMPRAS, archivo);
      if (rutaRelativa === ARCHIVO_PERMITIDO) {
        continue;
      }
      const contenido = readFileSync(archivo, 'utf-8');
      if (contenido.includes('.every(')) {
        infractores.push(rutaRelativa);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('estado-compra.ts SÍ usa .every( (confirma que el escaneo no es un falso negativo)', () => {
    const contenido = readFileSync(join(RAIZ_COMPRAS, ARCHIVO_PERMITIDO), 'utf-8');
    expect(contenido.includes('.every(')).toBe(true);
  });
});
