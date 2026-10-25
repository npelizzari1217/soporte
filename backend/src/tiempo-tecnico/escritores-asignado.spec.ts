/**
 * Guarda estructural de los tramos del técnico (odd/tasks/tiempo-tecnico.md, T3).
 *
 * Los tramos se abren y cierran en UN solo punto: `TicketRepositoryConTramos.save`, que
 * `TicketsModule` registra como `TICKET_REPOSITORY`. Eso vale mientras toda escritura del
 * responsable (`asignado_id`) o del estado (`estado_id`) de un ticket pase por ese repositorio.
 * Este spec lee el código y falla si aparece una que no:
 *
 * 1. quien muta el responsable o el estado de la entidad (`assignTo`, `updateEstado`) es uno de
 *    los casos de uso conocidos, y todos guardan con `ticketRepo.save(ticket)`;
 * 2. ninguna escritura directa a `tickets` (Prisma o SQL) fuera del repositorio toca esas columnas;
 * 3. `TICKET_REPOSITORY` se registra una sola vez, envuelto en `TicketRepositoryConTramos`.
 *
 * Si falla por un archivo nuevo: verificar que guarde por `TICKET_REPOSITORY` (o que no toque esas
 * columnas) y recién entonces sumarlo a la lista que corresponda.
 *
 * Excepción declarada: `scripts/importacion-legacy/tenant.ts` inserta tickets históricos con su
 * responsable por `createMany`. No abre tramos a propósito: no hay backfill (fuera de alcance del
 * documento) y no se sabe desde cuándo cada responsable tenía su ticket.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BACKEND = resolve(__dirname, '..', '..');

function archivosFuente(...directorios: string[]): string[] {
  const archivos: string[] = [];
  for (const directorio of directorios) {
    for (const entrada of readdirSync(join(BACKEND, directorio), { recursive: true })) {
      const ruta = String(entrada);
      if (!/\.(ts|js|mjs)$/.test(ruta) || /\.spec\.ts$/.test(ruta)) continue;
      if (ruta.split(/[\\/]/).includes('node_modules')) continue;
      archivos.push(join(directorio, ruta).split('\\').join('/'));
    }
  }
  return archivos.sort();
}

const FUENTES = archivosFuente('src', 'scripts', 'prisma_master/seeds');
const leer = (archivo: string): string => readFileSync(join(BACKEND, archivo), 'utf8');
const conPatron = (patron: RegExp): string[] => FUENTES.filter((f) => patron.test(leer(f)));

/** Bloques `data: { ... }` de un archivo, con llaves balanceadas. */
function bloquesData(codigo: string): string[] {
  const bloques: string[] = [];
  for (const coincidencia of codigo.matchAll(/\bdata:\s*\{/g)) {
    const desde = (coincidencia.index ?? 0) + coincidencia[0].length - 1;
    let profundidad = 0;
    for (let i = desde; i < codigo.length; i++) {
      if (codigo[i] === '{') profundidad += 1;
      if (codigo[i] === '}') profundidad -= 1;
      if (profundidad === 0) {
        bloques.push(codigo.slice(desde, i + 1));
        break;
      }
    }
  }
  return bloques;
}

/** Cláusulas SET de los `UPDATE tickets` crudos de un archivo. */
function clausulasSet(codigo: string): string[] {
  return [
    ...codigo.matchAll(/UPDATE\s+"?tickets"?[\s\S]*?\bSET\b([\s\S]*?)\b(WHERE|FROM|RETURNING)\b/g),
  ].map((m) => m[1]);
}

describe('tramos del técnico — toda escritura del responsable o del estado pasa por TICKET_REPOSITORY', () => {
  it('solo los casos de uso conocidos mutan responsable o estado, y todos guardan por el repositorio', () => {
    const mutadores = conPatron(/\.(assignTo|updateEstado)\(/);

    expect(mutadores).toEqual([
      'src/equipos/application/use-cases/crear-ticket-soporte.use-case.ts',
      'src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts',
      'src/tickets/application/services/avanzar-estado-por-tareas.service.ts',
      'src/tickets/application/use-cases/asignar-ticket.use-case.ts',
      'src/tickets/application/use-cases/asignar-y-poner-en-proceso.use-case.ts',
      'src/tickets/application/use-cases/crear-ticket.use-case.ts',
      'src/tickets/application/use-cases/transicionar-estado.use-case.ts',
    ]);
    for (const archivo of mutadores) {
      expect({ archivo, guarda: /this\.ticketRepo\.save\(ticket\)/.test(leer(archivo)) }).toEqual({
        archivo,
        guarda: true,
      });
    }
  });

  it('ninguna escritura directa a tickets fuera del repositorio toca asignado_id ni estado_id', () => {
    const escritores = conPatron(
      /\.ticket\.(create|createMany|update|updateMany|upsert)\(|INSERT INTO\s+"?tickets"?[\s(]|UPDATE\s+"?tickets"?\s/,
    );

    expect(escritores).toEqual([
      'scripts/backfill-tiempos-habiles.mjs',
      'scripts/importacion-legacy/tenant.ts',
      'scripts/post-deploy-smoke-fecha-cierre.mjs',
      'src/preventivo/infrastructure/persistence/prisma/prisma-preventivo-generacion.repository.ts',
      'src/sla/infrastructure/persistence/prisma/prisma-reloj-sla.repository.ts',
      'src/sla/infrastructure/persistence/prisma/prisma-sla-ticket-query.repository.ts',
      'src/tickets/infrastructure/persistence/prisma/prisma-primera-respuesta-write.repository.ts',
      'src/tickets/infrastructure/persistence/prisma/prisma-reloj-sla-marcador.ts',
      'src/tickets/infrastructure/persistence/prisma/prisma-ticket.repository.ts',
    ]);
    const exentos = new Set([
      'src/tickets/infrastructure/persistence/prisma/prisma-ticket.repository.ts',
      'scripts/importacion-legacy/tenant.ts',
    ]);
    for (const archivo of escritores.filter((a) => !exentos.has(a))) {
      const codigo = leer(archivo);
      const tocadas = [...bloquesData(codigo), ...clausulasSet(codigo)].filter((bloque) =>
        /\b(asignadoId|estadoId|asignado_id|estado_id)\b/.test(bloque),
      );
      expect({ archivo, tocadas }).toEqual({ archivo, tocadas: [] });
    }
  });

  it('TICKET_REPOSITORY se registra una sola vez y envuelto en TicketRepositoryConTramos', () => {
    expect(conPatron(/provide:\s*TICKET_REPOSITORY\b/)).toEqual(['src/tickets/tickets.module.ts']);
    expect(conPatron(/new PrismaTicketRepository\(/)).toEqual(['src/tickets/tickets.module.ts']);
    expect(leer('src/tickets/tickets.module.ts')).toMatch(
      /new TicketRepositoryConTramos\(new PrismaTicketRepository\(tenantContext\)/,
    );
  });

  it('la guarda detecta una escritura del responsable en un bloque data y en un SET crudo', () => {
    expect(
      bloquesData('x.ticket.update({ where: { id }, data: { titulo, asignadoId: y } })'),
    ).toEqual(['{ titulo, asignadoId: y }']);
    expect(
      clausulasSet('UPDATE tickets SET estado_id = $1, updated_at = now() WHERE id = $2'),
    ).toEqual([' estado_id = $1, updated_at = now() ']);
  });
});
