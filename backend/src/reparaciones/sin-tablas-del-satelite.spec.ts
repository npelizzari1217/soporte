/**
 * sin-tablas-del-satelite.spec.ts — verificación ESTRUCTURAL (odd/tasks/ticket-unificado.md, T4a,
 * L37): ningún código del backend toca las tablas viejas `ticket_edilicia`, `comentarios_reparacion`
 * y `reparacion_compra`, ni por sus delegados de Prisma ni por SQL crudo.
 *
 * T4a retira el código que las usa y T4b las borra en un deploy posterior: si algo vuelve a
 * leerlas o escribirlas, el `DROP TABLE` de T4b rompe en producción. Este escaneo lo frena antes.
 *
 * Alcance: `src/`, `scripts/` y `prisma_master/seeds/`, specs incluidos. Quedan fuera los specs de
 * migraciones (`migracion-*.spec.ts`), que reproducen migraciones ya aplicadas y necesitan esas
 * tablas en su fixture, y este mismo archivo. La prosa (un comentario que nombra la tabla) no
 * cuenta: el patrón de SQL exige la palabra clave delante.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const RAIZ_BACKEND = join(__dirname, '..', '..');
const CARPETAS = ['src', 'scripts', join('prisma_master', 'seeds')];

/** Acceso a un delegado de Prisma de las tablas viejas: `tx.ticketEdilicia.create(...)`. */
const DELEGADO = /\.(ticketEdilicia|comentarioReparacion|reparacionCompra)\s*\./;
/** SQL crudo sobre las tablas viejas: `INSERT INTO ticket_edilicia ...`. */
const SQL =
  /\b(FROM|INTO|JOIN|UPDATE|TABLE)\s+("?public"?\.)?"?(ticket_edilicia|comentarios_reparacion|reparacion_compra)\b/i;

function esEscaneable(nombre: string): boolean {
  return (
    /\.(ts|js|mjs)$/.test(nombre) &&
    !nombre.endsWith('.d.ts') &&
    !/^migracion-.*\.spec\.ts$/.test(nombre) &&
    nombre !== basename(__filename)
  );
}

function listarArchivos(dir: string): string[] {
  const archivos: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivos.push(...listarArchivos(ruta));
    } else if (esEscaneable(entrada)) {
      archivos.push(ruta);
    }
  }
  return archivos;
}

/** Las líneas que tocan una tabla vieja, como `ruta:línea`. */
function infracciones(): string[] {
  const encontradas: string[] = [];
  for (const carpeta of CARPETAS) {
    for (const archivo of listarArchivos(join(RAIZ_BACKEND, carpeta))) {
      readFileSync(archivo, 'utf-8')
        .split('\n')
        .forEach((linea, i) => {
          if (DELEGADO.test(linea) || SQL.test(linea)) {
            encontradas.push(`${relative(RAIZ_BACKEND, archivo)}:${i + 1}`);
          }
        });
    }
  }
  return encontradas;
}

describe('Las tablas viejas del satélite de Edilicia no se usan (odd/ticket-unificado, T4a)', () => {
  it('ningún archivo fuera de los specs de migraciones usa ticket_edilicia, comentarios_reparacion ni reparacion_compra', () => {
    expect(infracciones()).toEqual([]);
  });

  it('los patrones detectan un delegado y un SQL crudo, y no la prosa ni el campo ticketEdiliciaId', () => {
    expect(DELEGADO.test('await tx.ticketEdilicia.createMany({ data })')).toBe(true);
    expect(DELEGADO.test('tenantClient.reparacionCompra.count()')).toBe(true);
    expect(DELEGADO.test('this.client.comentarioReparacion .findMany()')).toBe(true);
    expect(SQL.test('INSERT INTO ticket_edilicia (ticket_id) VALUES ($1)')).toBe(true);
    expect(SQL.test('select * from public.comentarios_reparacion')).toBe(true);
    expect(SQL.test('JOIN "reparacion_compra" rc ON rc.id = x')).toBe(true);

    expect(DELEGADO.test('dto.ticketEdiliciaId = ticket.id;')).toBe(false);
    expect(SQL.test('// el satélite `ticket_edilicia` quedó congelado')).toBe(false);
  });

  it('el escaneo recorre las tres carpetas (no es un falso negativo por ruta)', () => {
    const rutas = CARPETAS.flatMap((c) => listarArchivos(join(RAIZ_BACKEND, c)));
    expect(rutas.map((r) => relative(RAIZ_BACKEND, r))).toEqual(
      expect.arrayContaining([
        join('src', 'reparaciones', 'reparaciones.module.ts'),
        join('scripts', 'importacion-legacy', 'tenant.ts'),
        join('prisma_master', 'seeds', 'demo-seed.ts'),
      ]),
    );
  });
});
