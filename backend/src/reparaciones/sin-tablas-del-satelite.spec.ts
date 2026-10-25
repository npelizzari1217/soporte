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

const TABLAS = 'ticket_edilicia|comentarios_reparacion|reparacion_compra';
const DELEGADOS = 'ticketEdilicia|comentarioReparacion|reparacionCompra';

/**
 * Acceso a un delegado de Prisma de las tablas viejas: `tx.ticketEdilicia.create(...)`, partido en
 * varias líneas (`tx\n  .ticketEdilicia\n  .create`), con encadenamiento opcional (`tx?.ticketEdilicia?.`),
 * pasado como argumento (`crearRepo(tx.reparacionCompra)`) o por corchetes (`tx['reparacionCompra']`).
 */
const DELEGADO = new RegExp(
  `\\??\\.\\s*(${DELEGADOS})\\s*(\\?\\.|\\.|[),;]|$)|\\[\\s*['"\`](${DELEGADOS})['"\`]\\s*\\]`,
  'm',
);
/**
 * Relación de Prisma hacia las tablas viejas dentro de un `include`, `select` o escritura anidada:
 * `include: { ticketEdilicia: true }`. `ticketEdiliciaId` no cuenta: es el nombre del campo, no la
 * relación. Las relaciones del satélite (`comentarios`, `comprasVinculadas`) solo se alcanzan a
 * través de `ticketEdilicia`, y sus nombres los usan otros puertos: no se buscan solas.
 */
const RELACION = /\b(ticketEdilicia|reparacionesVinculadas)\s*:/;
/**
 * SQL crudo sobre las tablas viejas, aunque esté partido en líneas o la tabla no sea la primera de
 * la lista: `INSERT INTO ticket_edilicia`, `TRUNCATE tickets, reparacion_compra`.
 */
const SQL = new RegExp(
  `\\b(FROM|INTO|JOIN|UPDATE|TABLE|TRUNCATE)\\s+(ONLY\\s+)?(IF\\s+EXISTS\\s+)?` +
    `([\\w."]+\\s*,\\s*)*("?public"?\\.)?"?(${TABLAS})\\b`,
  'i',
);

/**
 * Reemplaza los comentarios por espacios del mismo largo, sin tocar los saltos de línea: la prosa
 * que nombra una tabla no es un uso, y los números de línea siguen valiendo. `//` precedido por `:`
 * es una URL dentro de un string, no un comentario.
 */
function sinComentarios(fuente: string): string {
  const blanquear = (m: string): string => m.replace(/[^\n]/g, ' ');
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, blanquear)
    .replace(
      /(^|[^:])(\/\/.*)$/gm,
      (_m, antes: string, comentario: string) => antes + blanquear(comentario),
    );
}

/** Las posiciones (`índice`) donde el código toca una tabla vieja. */
function usos(fuente: string): number[] {
  const codigo = sinComentarios(fuente);
  const posiciones: number[] = [];
  for (const patron of [DELEGADO, RELACION, SQL]) {
    const global = new RegExp(patron.source, patron.flags + 'g');
    for (const m of codigo.matchAll(global)) posiciones.push(m.index);
  }
  return posiciones.sort((a, b) => a - b);
}

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

/** Los usos de una tabla vieja, como `ruta:línea`. */
function infracciones(): string[] {
  const encontradas: string[] = [];
  for (const carpeta of CARPETAS) {
    for (const archivo of listarArchivos(join(RAIZ_BACKEND, carpeta))) {
      const fuente = readFileSync(archivo, 'utf-8');
      for (const indice of usos(fuente)) {
        const linea = fuente.slice(0, indice).split('\n').length;
        encontradas.push(`${relative(RAIZ_BACKEND, archivo)}:${linea}`);
      }
    }
  }
  return encontradas;
}

describe('Las tablas viejas del satélite de Edilicia no se usan (odd/ticket-unificado, T4a)', () => {
  it('ningún archivo fuera de los specs de migraciones usa ticket_edilicia, comentarios_reparacion ni reparacion_compra', () => {
    expect(infracciones()).toEqual([]);
  });

  it('detecta un delegado, una relación y un SQL crudo, también partidos en varias líneas', () => {
    expect(usos('await tx.ticketEdilicia.createMany({ data })')).toHaveLength(1);
    expect(usos('tenantClient.reparacionCompra.count()')).toHaveLength(1);
    expect(usos('this.client.comentarioReparacion .findMany()')).toHaveLength(1);
    expect(usos('await tx\n  .ticketEdilicia\n  .findMany()')).toHaveLength(1);
    expect(usos("const delegado = tx['reparacionCompra'];")).toHaveLength(1);
    expect(usos('include: { ticketEdilicia: true }')).toHaveLength(1);
    expect(usos('data: { reparacionesVinculadas: { create: [] } }')).toHaveLength(1);
    expect(usos('INSERT INTO ticket_edilicia (ticket_id) VALUES ($1)')).toHaveLength(1);
    expect(usos('select * from public.comentarios_reparacion')).toHaveLength(1);
    expect(usos('JOIN "reparacion_compra" rc ON rc.id = x')).toHaveLength(1);
    expect(usos('`DELETE FROM\n  ticket_edilicia\n  WHERE id = $1`')).toHaveLength(1);
    expect(usos("'TRUNCATE tickets, reparacion_compra CASCADE'")).toHaveLength(1);
    expect(usos('\'TRUNCATE TABLE tareas_ticket, "ticket_edilicia" CASCADE\'')).toHaveLength(1);
    expect(usos("'DROP TABLE IF EXISTS comentarios_reparacion'")).toHaveLength(1);
    expect(usos('await tx?.ticketEdilicia?.findMany()')).toHaveLength(1);
    expect(usos('crearRepo(tx.reparacionCompra)')).toHaveLength(1);
    expect(usos("'ALTER TABLE reparacion_compra DROP x'")).toHaveLength(1);
    expect(usos('select: { ticketEdilicia: { select: { id: true } } }')).toHaveLength(1);
  });

  it('no cuenta la prosa, los comentarios ni el campo ticketEdiliciaId', () => {
    expect(usos('dto.ticketEdiliciaId = ticket.id;')).toEqual([]);
    expect(usos('const fila = { ticketEdiliciaId: id };')).toEqual([]);
    expect(usos('{ comprasVinculadas: async (id: string) => [] }')).toEqual([]);
    expect(usos("'SELECT ticket_edilicia_id FROM ticket_compra'")).toEqual([]);
    expect(usos("'from reparacion_compra_x'")).toEqual([]);
    expect(usos('// el satélite `ticket_edilicia` quedó congelado')).toEqual([]);
    expect(usos('// antes: DELETE FROM ticket_edilicia WHERE id = $1')).toEqual([]);
    expect(usos('/* tx.ticketEdilicia.create(...)\n   JOIN reparacion_compra */')).toEqual([]);
    expect(usos("const url = 'http://x'; // FROM ticket_edilicia")).toEqual([]);
  });

  it('el número de línea apunta al uso aunque haya un comentario de bloque antes', () => {
    const fuente = '/*\n * prosa\n */\nconst a = 1;\nawait tx.reparacionCompra.count();\n';
    const [indice] = usos(fuente);
    expect(fuente.slice(0, indice).split('\n').length).toBe(5);
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
